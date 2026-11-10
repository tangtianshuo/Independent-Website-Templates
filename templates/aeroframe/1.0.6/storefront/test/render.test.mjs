import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchPublishedPage, publishedPage, readPublishedPage } from '../server/utils/published.mjs';

const checksum = (value) => createHash('sha256').update(JSON.stringify(value, (_, child) =>
  child && !Array.isArray(child) && typeof child === 'object'
    ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child)).digest('hex');
const preset = { id: 'aeroframe', version: '1.0.6', name: 'AeroFrame', description: '', theme: { background: '#000000', foreground: '#ffffff', accent: '#4f7dff', muted: '#cccccc', font: 'Inter' }, demo: { brand: 'Published brand', hero: { title: 'Home', subtitle: '', image: '' }, product: { title: '', description: '', price: '', image: '' }, collection: { title: '', description: '', image: '' }, page: { title: '', body: '', image: '' } } };
const page = (path, view) => ({ path, pageKey: view, entryId: 'entry-1', content: { kind: 'preset-page', view, preset, seo: { title: 'Published', description: '' }, sections: [], items: [{ label: 'Hidden', path: '/products/hidden', image: '', description: '', price: '' }] } });
const snapshot = { schemaVersion: 1, workspaceId: 'workspace-1', siteId: 'site-1', language: 'en', pages: [page('/', 'home'), page('/pages/about', 'page')], navigation: [{ label: 'About', path: '/pages/about' }, { label: 'Draft', path: '/pages/draft' }], redirects: [{ from: '/pages/old', to: '/pages/about' }] };
const envelope = (value = snapshot) => ({ schemaVersion: 1, workspaceId: 'workspace-1', siteId: 'site-1', releaseId: 'release-1', checksum: checksum(value), snapshot: value });
const render = (value, path = '/') => publishedPage(value, 'workspace-1', 'site-1', path);

test('only public fields and links present in matching published release are exposed', () => {
  const home = render(envelope());
  assert.equal(home.content.preset.demo.brand, 'Published brand');
  assert.deepEqual(home.navigation, [{ label: 'About', path: '/pages/about' }]);
  assert.deepEqual(home.items, []);
  assert.deepEqual(Object.keys(home).sort(), ['content', 'items', 'language', 'links', 'navigation', 'path', 'siteId']);
  assert.deepEqual(Object.keys(home.content).sort(), ['preset', 'sections', 'seo', 'view']);
  assert.equal(render(envelope(), '/pages/draft'), null);
});

test('serves exact CMS-published paths beyond preset route names', () => {
  const value = structuredClone(snapshot);
  value.pages.push(page('/shipping', 'page'));
  value.navigation.push({ label: 'Shipping', path: '/shipping' });
  assert.equal(render(envelope(value), '/shipping').path, '/shipping');
  assert.deepEqual(render(envelope(value)).navigation.at(-1), { label: 'Shipping', path: '/shipping' });
  assert.equal(render(envelope(value), '/shipping/'), null);
  assert.equal(render(envelope(value), '/safe'), null);
});

test('rejects malformed or inconsistent envelope and raw snapshot', () => {
  const changed = (mutate, recalculate = false) => {
    const value = structuredClone(envelope());
    mutate(value);
    if (recalculate) value.checksum = checksum(value.snapshot);
    return value;
  };
  for (const value of [
    changed((v) => { v.workspaceId = 'other'; }),
    changed((v) => { v.snapshot.siteId = 'other'; }, true),
    changed((v) => { v.snapshot.workspaceId = 'other'; }, true),
    changed((v) => { v.schemaVersion = 2; }),
    changed((v) => { v.releaseId = ''; }),
    changed((v) => { v.checksum = '0'.repeat(64); }),
    changed((v) => { v.snapshot.pages[0].content.preset.demo.hero.extra = 'private'; }, true),
    changed((v) => { v.snapshot.pages[0].content.extra = 'private'; }, true),
    changed((v) => { v.extra = 'private'; }),
  ]) assert.equal(render(value), null);
  assert.equal(publishedPage(envelope(), 'workspace-1', 'other-site', '/'), null);
  assert.equal(publishedPage(envelope(), 'other-workspace', 'site-1', '/'), null);
});

test('redirects old paths only to published same-site pages', () => {
  assert.deepEqual(render(envelope(), '/pages/old'), { redirect: '/pages/about' });
  const shipping = structuredClone(snapshot);
  shipping.pages.push(page('/shipping', 'page'));
  shipping.redirects.push({ from: '/safe', to: '/shipping' });
  assert.deepEqual(render(envelope(shipping), '/safe'), { redirect: '/shipping' });
  assert.equal(render(envelope(shipping), '/missing'), null);
  for (const to of ['//evil.test', 'https://evil.test', '/pages/draft', '/api/published', '/pages/about?next=evil']) {
    const value = structuredClone(snapshot);
    value.redirects[0].to = to;
    assert.equal(render(envelope(value), '/pages/old'), null);
  }
  assert.equal(render(envelope(), '//evil.test'), null);
});

test('reserved API paths cannot be published as pages or redirect sources', () => {
  const value = structuredClone(snapshot);
  value.pages.push(page('/api/published', 'page'));
  assert.equal(render(envelope(value), '/api/published'), null);
  assert.equal(render(envelope(value), '/'), null);
  const redirected = structuredClone(snapshot);
  redirected.redirects.push({ from: '/api/custom', to: '/' });
  assert.equal(render(envelope(redirected), '/api/custom'), null);
});

test('gateway lookup fixes site identity and credentials on server', async () => {
  const result = await fetchPublishedPage({ gatewayUrl: 'http://gateway.test/', workspaceId: 'workspace-1', siteId: 'site-1', credential: 'site-secret', path: '/', fetcher: async (url, options) => {
    assert.equal(url.href, 'http://gateway.test/api/v1/sites/site-1/published-release');
    assert.deepEqual(options.headers, { authorization: 'Bearer site-secret' });
    return { ok: true, json: async () => envelope() };
  } });
  assert.equal(result.path, '/');
  assert.equal(await fetchPublishedPage({ gatewayUrl: 'http://gateway.test', workspaceId: 'workspace-1', siteId: 'site-1', credential: 'site-secret', path: '//evil.test' }), null);
});

test('candidate gateway lookup includes the pending release ID', async () => {
  const result = await fetchPublishedPage({ gatewayUrl: 'http://gateway.test', workspaceId: 'workspace-1', siteId: 'site-1', credential: 'candidate-secret', releaseId: 'pending-release', path: '/', fetcher: async (url, options) => {
    assert.equal(url.href, 'http://gateway.test/api/v1/sites/site-1/published-release?releaseId=pending-release');
    assert.deepEqual(options.headers, { authorization: 'Bearer candidate-secret' });
    return { ok: true, json: async () => envelope() };
  } });
  assert.equal(result.path, '/');
});

test('reads a published snapshot locally without contacting the gateway', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'published-snapshot-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'release.json');
  await writeFile(path, JSON.stringify(envelope()));
  const result = await readPublishedPage({ snapshotPath: path, workspaceId: 'workspace-1', siteId: 'site-1', path: '/' });
  assert.equal(result.path, '/');
  await writeFile(path, JSON.stringify({ ...snapshot, contractVersion: 1, template: { id: 'aeroframe', version: '1.0.6' }, navigation: snapshot.navigation.map((link, i) => ({ id: String(i), label: link.label, href: link.path, children: [], enabled: true })), assets: [] }));
  const rawResult = await readPublishedPage({ snapshotPath: path, workspaceId: 'workspace-1', siteId: 'site-1', path: '/' });
  assert.equal(rawResult.path, '/');
  await assert.rejects(readPublishedPage({ snapshotPath: join(root, 'missing.json'), workspaceId: 'workspace-1', siteId: 'site-1', path: '/' }), /snapshot/i);
});


test('explicit views are independent of URL shape and unknown views fail closed', () => {
  const value = structuredClone(snapshot);
  value.pages.push(page('/catalog', 'collection'), page('/custom-aircraft', 'product'), page('/landing', 'home'));
  assert.equal(render(envelope(value), '/catalog')?.content.view, 'collection');
  assert.equal(render(envelope(value), '/custom-aircraft')?.content.view, 'product');
  assert.equal(render(envelope(value), '/landing')?.content.view, 'home');
  value.pages[0].content.view = 'unknown';
  assert.equal(render(envelope(value)), null);
});

test('renderer data retains safe theme and supported section order', () => {
  const value = structuredClone(snapshot);
  value.pages[0].content.sections = ['feature', 'hero'];
  const home = render(envelope(value));
  assert.deepEqual(home.content.preset.theme, { background: '#000000', foreground: '#ffffff', accent: '#4f7dff', muted: '#cccccc', font: 'Inter' });
  assert.deepEqual(home.content.sections, ['feature', 'hero']);
  value.pages[0].content.preset.theme.accent = 'red; background:url(https://attacker.test)';
  assert.equal(render(envelope(value)), null);
});

test('exposes only public lead operations to the renderer', () => {
  const value = structuredClone(snapshot);
  value.operations = { seoTitle: 'Demo', seoDescription: '', contactFormEnabled: true, socialImageUrl: '/_assets/social.png' };
  const home = render(envelope(value));
  assert.deepEqual(home.content.operations, { seoTitle: 'Demo', seoDescription: '', contactFormEnabled: true, socialImageUrl: '/_assets/social.png' });
});


test('CMS section layouts apply typed overrides while preserving model defaults', () => {
  const value = structuredClone(snapshot);
  value.pages[0].content.sections = ['hero', 'feature'];
  value.pages[0].content.sectionConfigs = [
    { type: 'hero', enabled: true, data: { title: 'Section headline', image: '/_assets/media/hero.png' } },
    { type: 'feature', enabled: true, data: { eyebrow: 'Section eyebrow' } },
  ];
  const home = render(envelope(value));
  assert.equal(home?.content.preset.demo.hero.title, 'Section headline');
  assert.equal(home.content.preset.demo.hero.image, '/_assets/media/hero.png');
  assert.equal(home.content.preset.showcase.eyebrow, 'Section eyebrow');
  value.pages[0].content.layoutDocument = { version: 1, mode: 'template', root: [
    { id: 'hero', kind: 'section', type: 'hero', enabled: true, props: { title: 'Layout headline' }, children: [] },
    { id: 'feature', kind: 'section', type: 'feature', enabled: false, props: {}, children: [] },
  ] };
  const layout = render(envelope(value));
  assert.equal(layout?.content.preset.demo.hero.title, 'Layout headline');
  assert.deepEqual(layout.content.sections, ['hero']);
  for (const mutate of [
    v => { v.pages[0].content.layoutDocument.root[0].props.extra = 'rogue'; },
    v => { v.pages[0].content.layoutDocument.root[0].props.title = 42; },
    v => { v.pages[0].content.layoutDocument.root[0].type = 'unknown'; },
  ]) { const invalid = structuredClone(value); mutate(invalid); assert.equal(render(envelope(invalid)), null); }
});

test('local contract identity must match the immutable runtime and every page', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'published-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const snapshotPath = join(root, 'snapshot.json');
  const contract = { ...structuredClone(snapshot), contractVersion: 1, template: { id: preset.id, version: preset.version }, navigation: snapshot.navigation.map((link, i) => ({ id: String(i), label: link.label, href: link.path, children: [], enabled: true })), assets: [] };
  await writeFile(snapshotPath, JSON.stringify(contract));
  assert.equal((await readPublishedPage({ snapshotPath,workspaceId:'workspace-1',siteId:'site-1',path:'/' }))?.path, '/');
  for (const mutate of [
    v => { v.template.version = '9.9.9'; },
    v => { v.pages[0].content.preset.version = '9.9.9'; },
    v => { v.unknown = 'rogue'; },
  ]) {
    const invalid = structuredClone(contract); mutate(invalid);
    await writeFile(snapshotPath, JSON.stringify(invalid));
    assert.equal(await readPublishedPage({ snapshotPath,workspaceId:'workspace-1',siteId:'site-1',path:'/' }), null);
  }
});
