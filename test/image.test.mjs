import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import test from 'node:test';

const exec = promisify(execFile);
const templateId = process.env.TEMPLATE_ID || 'aeroframe';
assert.match(templateId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const version = process.env.TEMPLATE_VERSION || '1.0.3';
const image = process.env.RELEASE_IMAGE || `local/${templateId}:${version}`;
const siteId = 'published-site';
const workspaceId = 'published-workspace';
const credential = 'fixture-site-token';
const preset = {
  id: templateId, version, name: 'AeroFrame', description: 'A mission-ready storefront for drone, robotics, and low-altitude technology brands.',
  theme: { background: '#080d14', foreground: '#f3f6fa', accent: '#4f7dff', muted: '#182432', font: 'Arial, sans-serif' },
  demo: {
    brand: 'AEROWORKS', contactEmail: 'sales@example.com',
    hero: { title: 'Built for the missions ahead', subtitle: 'Reliable aerial systems for demanding work in the real world.', image: '/assets/hero.png' },
    collection: { title: 'Aircraft systems', description: 'Field-ready platforms for inspection, mapping, and response teams.', image: '/assets/hero.png' },
    product: { title: 'Aero X8 industrial platform', description: 'A modular multirotor platform built for inspection, mapping, and rapid deployment.', price: '$8,490', image: '/assets/hero.png' },
    page: { title: 'Engineering in the field', body: 'We build dependable unmanned systems around the work operators need to complete.', image: '/assets/hero.png' },
  },
  showcase: { eyebrow: 'UNMANNED SYSTEMS / FIELD PROVEN', heroLabel: 'AERIAL SYSTEMS FOR COMPLEX MISSIONS', stats: [{ value: '25 min', label: 'Rapid deployment' }, { value: '12 kg', label: 'Payload capacity' }, { value: 'IP54', label: 'Weather protection' }], products: [], solutions: [], faq: [{ question: 'Can the aircraft carry custom payloads?', answer: 'Platforms are designed around modular payload integration. Share your sensor, mount, and mission requirements for a compatibility review.' }] },
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
    if (req.url !== `/api/v1/sites/${siteId}/published-release` || req.headers.authorization !== `Bearer ${credential}`) {
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
    if (!process.env.RELEASE_IMAGE) await exec('docker', ['build', '--build-arg', `SOURCE_COMMIT=${process.env.SOURCE_COMMIT || 'unknown'}`, '--build-arg', `RELEASE_VERSION=${process.env.RELEASE_VERSION || version}`, '-f', `templates/${templateId}/${version}/Dockerfile`, '-t', image, `templates/${templateId}/${version}`], { timeout: 240000 });
    if (process.env.RELEASE_VERSION) {
      const { stdout: imageVersion } = await exec('docker', ['image', 'inspect', '--format', '{{ index .Config.Labels "org.opencontainers.image.version" }}', image]);
      const { stdout: imageRevision } = await exec('docker', ['image', 'inspect', '--format', '{{ index .Config.Labels "org.opencontainers.image.revision" }}', image]);
      assert.equal(imageVersion.trim(), process.env.RELEASE_VERSION);
      if (process.env.SOURCE_COMMIT) assert.equal(imageRevision.trim(), process.env.SOURCE_COMMIT);
    }
    const { stdout } = await exec('docker', ['run', '-d', '--rm', '--add-host', 'host.docker.internal:host-gateway', '-p', '127.0.0.1::3000', '-e', `NUXT_GATEWAY_URL=http://host.docker.internal:${server.address().port}`, '-e', `NUXT_WORKSPACE_ID=${workspaceId}`, '-e', `NUXT_SITE_ID=${siteId}`, '-e', `NUXT_SITE_CREDENTIAL=${credential}`, image]);
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
    for (const [path, expected] of [['/', 'Built for the missions ahead'], ['/collections', 'Aircraft systems'], ['/products/scout-x1', 'Aero X8 industrial platform'], ['/pages/about', 'Engineering in the field'], ['/shipping', 'Engineering in the field']]) {
      const response = await fetch(`${base}${path}?siteId=attacker`, { headers: { Host: 'attacker.test' } });
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.ok(html.includes(expected), path);
      assert.ok(html.includes('AEROWORKS'), path);
      assert.ok(!html.includes(credential) && !html.includes('adminOrigin') && !html.includes('cmsInternalOrigin'));
    if (path === '/') assert.match(html, /<summary[^>]*>Can the aircraft carry custom payloads\?/);
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
    assert.ok(requests.every((request) => request.url === `/api/v1/sites/${siteId}/published-release` && request.authorization === `Bearer ${credential}`));
  } finally {
    if (container) await exec('docker', ['stop', container]);
    await new Promise((resolve) => server.close(resolve));
  }
});
