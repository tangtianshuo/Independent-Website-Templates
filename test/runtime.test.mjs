import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const storefront = new URL('templates/aeroframe/1.0.3/storefront/', root);
const manifest = JSON.parse(await readFile(new URL('../template.json', storefront)));
const preset = { id: manifest.id, version: manifest.version, name: manifest.name, description: manifest.description, ...manifest.presentation };
preset.theme = { background: '#010203', foreground: '#fafafa', accent: '#ff3300', muted: '#112233', font: 'Arial, sans-serif' };
const page = (path, view, sections) => ({ path, entryId: `${view}-entry`, pageKey: view,
  content: { kind: 'preset-page', view, preset, sections, seo: { title: `${view} title`, description: '' }, items: [{ label: 'Aircraft', path: '/aircraft', image: '', description: 'Published aircraft', price: '$1' }] } });
const snapshot = { schemaVersion: 1, workspaceId: 'workspace', siteId: 'site', language: 'en', pages: [
  page('/', 'home', ['feature', 'hero']), page('/catalog', 'collection', ['grid', 'heading']),
  page('/aircraft', 'product', ['information', 'description', 'gallery']), page('/company', 'page', ['story']),
], navigation: [{ label: 'Catalog', path: '/catalog' }, { label: 'Company', path: '/company' }], redirects: [{ from: '/old-catalog', to: '/catalog' }] };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)])) : value;
const envelope = { schemaVersion: 1, workspaceId: 'workspace', siteId: 'site', releaseId: 'release', checksum: createHash('sha256').update(JSON.stringify(canonical(snapshot))).digest('hex'), snapshot };

async function listen(server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server.address().port;
}
async function renderer(t, gatewayUrl, previewAdminOrigin) {
  const reserve = createServer(); const port = await listen(reserve);
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, ['.output/server/index.mjs'], { cwd: storefront, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1',
    NUXT_GATEWAY_URL: gatewayUrl, NUXT_WORKSPACE_ID: 'workspace', NUXT_SITE_ID: 'site', NUXT_SITE_CREDENTIAL: 'private-site-credential', NUXT_PUBLIC_PREVIEW_ADMIN_ORIGIN: previewAdminOrigin } });
  let logs = ''; child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
  t.after(async () => { if (child.exitCode !== null) return; const ended = new Promise(resolve => child.once('exit', resolve)); child.kill(); await ended; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(logs);
    try { if ((await fetch(`${base}/healthz`)).ok) return base; } catch {}
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Renderer did not start: ${logs}`);
}

test('built 1.0.3 renders explicit paths, theme and section order, and keeps private preview empty on the server', { skip: !process.env.TEST_BUILT_TEMPLATE, timeout: 30000 }, async t => {
  const requests = [];
  const gateway = createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    if (req.url !== '/api/v1/sites/site/published-release' || req.headers.authorization !== 'Bearer private-site-credential') return res.writeHead(403).end();
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(envelope));
  });
  const port = await listen(gateway); t.after(() => new Promise(resolve => gateway.close(resolve)));
  const base = await renderer(t, `http://127.0.0.1:${port}`, 'https://cms.example.com');
  for (const [path, first, second] of [['/', 'class="aero-intro', 'class="aero-hero"'], ['/catalog', 'class="aero-product-grid', 'AIRCRAFT / PRODUCT RANGE'], ['/aircraft', 'class="aero-product-page__info', 'class="aero-product-description']]) {
    const response = await fetch(`${base}${path}`); assert.equal(response.status, 200, path);
    const html = await response.text(); assert.ok(html.indexOf(first) >= 0 && html.indexOf(first) < html.indexOf(second), `${path} follows sections order`);
    assert.match(html, /--aero-bg:#010203/); assert.match(html, /--aero-blue:#ff3300/); assert.match(html, /--aero-font:Arial/);
    assert.ok(!html.includes('private-site-credential')); assert.ok(!html.includes('cms-entry'));
    if (path === '/') assert.match(html, /href="\/catalog"/);
    if (path === '/aircraft') assert.ok(html.indexOf('class="aero-product-description') < html.indexOf('class="aero-product-page__image'));
  }
  const redirect = await fetch(`${base}/old-catalog`, { redirect: 'manual' }); assert.equal(redirect.status, 308); assert.equal(redirect.headers.get('location'), '/catalog');
  const requestCount = requests.length;
  const preview = await fetch(`${base}/preview`); assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('cache-control'), 'no-store');
  assert.equal(preview.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.equal(preview.headers.get('content-security-policy'), 'frame-ancestors https://cms.example.com');
  const shell = await preview.text(); assert.match(shell, /Waiting for a private CMS preview/); assert.ok(!shell.includes('Aircraft systems')); assert.equal(requests.length, requestCount);
  const publicData = await (await fetch(`${base}/api/published?path=/catalog`)).text();
  for (const privateField of ['entryId', 'workspaceId', 'siteId', 'checksum', 'private-site-credential']) assert.ok(!publicData.includes(privateField));
  assert.equal((await fetch(`${base}/api/preview`)).status, 404);
  const disabled = await renderer(t, `http://127.0.0.1:${port}`, '');
  const missing = await fetch(`${disabled}/preview`); assert.equal(missing.status, 404); assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.ok(requests.every(request => request.url === '/api/v1/sites/site/published-release' && request.authorization === 'Bearer private-site-credential'));
});
