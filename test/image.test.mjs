import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const image = 'local/aeroframe:1.0.0';
const siteId = 'published-site';
const workspaceId = 'published-workspace';
const credential = 'fixture-site-token';
const preset = {
  id: 'aeroframe', version: '1.0.0', name: 'AeroFrame', description: 'Aircraft',
  theme: { background: '#080d14', foreground: '#f3f6fa', accent: '#4f7dff', muted: '#94a2b6', font: 'Inter' },
  demo: {
    brand: 'Flight Works', contactEmail: 'sales@example.test',
    hero: { title: 'Mission ready airframes', subtitle: 'Field tested platforms.', image: '/assets/hero.png' },
    collection: { title: 'Our fleet', description: 'Built to work.', image: '/assets/hero.png' },
    product: { title: 'Scout X1', description: 'Long-range survey platform.', price: '$1,200', image: '/assets/hero.png' },
    page: { title: 'Our approach', body: 'Engineered for real operations.', image: '/assets/hero.png' },
  },
  showcase: { eyebrow: 'OUR SYSTEMS', heroLabel: 'FIELD PROVEN', stats: [{ label: 'Range', value: '80 km' }], products: [], solutions: [], faq: [{ question: 'Can it fly in rain?', answer: 'Yes, with the weather kit.' }] },
};
const content = (view, title, items = []) => ({ kind: 'preset-page', view, preset, sections: view === 'home' ? ['hero', 'feature'] : view === 'collection' ? ['heading', 'grid'] : view === 'product' ? ['gallery', 'description', 'information'] : ['story'], seo: { title, description: 'Published description' }, items });
const snapshot = {
  schemaVersion: 1, workspaceId, siteId, language: 'en', navigation: [{ label: 'Overview', path: '/' }, { label: 'Platforms', path: '/collections' }, { label: 'Company', path: '/pages/about' }, { label: 'Shipping', path: '/shipping' }], redirects: [{ from: '/pages/old', to: '/pages/about' }, { from: '/safe', to: '/shipping' }],
  pages: [
    { path: '/', pageKey: 'home', entryId: 'home-1', content: content('home', 'Home', [{ label: 'Scout X1', path: '/products/scout-x1', image: '/assets/hero.png', description: 'Long-range survey platform.', price: '$1,200' }]) },
    { path: '/collections', pageKey: 'collections', entryId: 'collection-1', content: content('collection', 'Fleet', [{ label: 'Scout X1', path: '/products/scout-x1', image: '/assets/hero.png', description: 'Long-range survey platform.', price: '$1,200' }]) },
    { path: '/products/scout-x1', pageKey: 'product', entryId: 'product-1', content: content('product', 'Scout X1') },
    { path: '/pages/about', pageKey: 'content', entryId: 'about-1', content: content('page', 'About') },
    { path: '/shipping', pageKey: 'shipping', entryId: 'shipping-1', content: content('page', 'Shipping') },
  ],
};

function gateway() {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    res.setHeader('content-type', 'application/json');
    if (req.url !== `/sites/${siteId}/published-release` || req.headers.authorization !== `Bearer ${credential}`) {
      res.writeHead(403).end('{}');
      return;
    }
    const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)])) : value;
    res.end(JSON.stringify({ schemaVersion: 1, workspaceId, siteId, releaseId: 'release-1',
      checksum: createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex'), snapshot }));
  });
  return { server, requests };
}

test('standalone image renders only its bound published release via authenticated gateway', { timeout: 300000 }, async () => {
  const { server, requests } = gateway();
  await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
  let container;
  try {
    await exec('docker', ['build', '-f', 'templates/aeroframe/1.0.0/Dockerfile', '-t', image, 'templates/aeroframe/1.0.0'], { timeout: 240000 });
    const { stdout } = await exec('docker', ['run', '-d', '--rm', '-p', '127.0.0.1::3000', '-e', `NUXT_GATEWAY_URL=http://host.docker.internal:${server.address().port}`, '-e', `NUXT_WORKSPACE_ID=${workspaceId}`, '-e', `NUXT_SITE_ID=${siteId}`, '-e', `NUXT_SITE_CREDENTIAL=${credential}`, image]);
    container = stdout.trim();
    const { stdout: port } = await exec('docker', ['port', container, '3000/tcp']);
    const base = `http://127.0.0.1:${port.trim().match(/:(\d+)$/)?.[1]}`;
    let health;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { health = await fetch(`${base}/healthz`); if (health.ok) break; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(health?.status, 200);
    assert.equal(await health.text(), 'ok');
    for (const [path, expected] of [['/', 'Mission ready airframes'], ['/collections', 'Our fleet'], ['/products/scout-x1', 'Scout X1'], ['/pages/about', 'Our approach'], ['/shipping', 'Our approach']]) {
      const response = await fetch(`${base}${path}?siteId=attacker`, { headers: { Host: 'attacker.test' } });
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.ok(html.includes(expected), path);
      assert.ok(html.includes('Flight Works'), path);
      assert.ok(!html.includes(credential) && !html.includes('adminOrigin') && !html.includes('cmsInternalOrigin'));
      if (path === '/') assert.match(html, /<summary[^>]*>Can it fly in rain\?/);
    }
    const old = await fetch(`${base}/pages/old`, { redirect: 'manual' });
    assert.equal(old.status, 308);
    assert.equal(old.headers.get('location'), '/pages/about');
    const safe = await fetch(`${base}/safe`, { redirect: 'manual' });
    assert.equal(safe.status, 308);
    assert.equal(safe.headers.get('location'), '/shipping');
    const exposed = await (await fetch(`${base}/api/published?path=/`)).text();
    for (const privateField of ['entryId', 'pageKey', 'workspaceId', 'siteId', 'releaseId', 'checksum', 'site-secret']) {
      assert.ok(!exposed.includes(privateField), privateField);
    }
    assert.equal((await fetch(`${base}/pages/unpublished`)).status, 404);
    assert.equal((await fetch(`${base}/unpublished`)).status, 404);
    assert.equal((await fetch(`${base}/preview`)).status, 404);
    assert.ok(requests.length >= 4);
    assert.ok(requests.every((request) => request.url === `/sites/${siteId}/published-release` && request.authorization === `Bearer ${credential}`));
  } finally {
    if (container) await exec('docker', ['stop', container]);
    await new Promise((resolve) => server.close(resolve));
  }
});
