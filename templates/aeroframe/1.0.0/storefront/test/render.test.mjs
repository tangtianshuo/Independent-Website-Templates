import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fetchPublishedPage, publishedPage } from '../server/utils/published.mjs';

const checksum = (value) => createHash('sha256').update(JSON.stringify(value, (_, child) =>
  child && !Array.isArray(child) && typeof child === 'object'
    ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b))) : child)).digest('hex');
const preset = { id: 'aeroframe', version: '1.0.0', name: 'AeroFrame', description: '', theme: { background: '#000000', foreground: '#ffffff', accent: '#4f7dff', muted: '#cccccc', font: 'Inter' }, demo: { brand: 'Published brand', hero: { title: 'Home', subtitle: '', image: '' }, product: { title: '', description: '', price: '', image: '' }, collection: { title: '', description: '', image: '' }, page: { title: '', body: '', image: '' } } };
const page = (path, view) => ({ path, pageKey: view, entryId: 'entry-1', content: { kind: 'preset-page', view, preset, seo: { title: 'Published', description: '' }, sections: [], items: [{ label: 'Hidden', path: '/products/hidden', image: '', description: '', price: '' }] } });
const snapshot = { schemaVersion: 1, workspaceId: 'workspace-1', siteId: 'site-1', language: 'en', pages: [page('/', 'home'), page('/pages/about', 'page')], navigation: [{ label: 'About', path: '/pages/about' }, { label: 'Draft', path: '/pages/draft' }], redirects: [{ from: '/pages/old', to: '/pages/about' }] };
const envelope = (value = snapshot) => ({ schemaVersion: 1, workspaceId: 'workspace-1', siteId: 'site-1', releaseId: 'release-1', checksum: checksum(value), snapshot: value });
const render = (value, path = '/') => publishedPage(value, 'workspace-1', 'site-1', path);

test('only public fields and links present in matching published release are exposed', () => {
  const home = render(envelope());
  assert.equal(home.content.preset.demo.brand, 'Published brand');
  assert.deepEqual(home.navigation, [{ label: 'About', path: '/pages/about' }]);
  assert.deepEqual(home.items, []);
  assert.deepEqual(Object.keys(home).sort(), ['content', 'items', 'language', 'navigation', 'path']);
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
