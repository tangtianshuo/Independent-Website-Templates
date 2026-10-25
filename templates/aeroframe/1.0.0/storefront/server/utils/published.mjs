import { createHash } from 'node:crypto';

const route = /^\/(?:[^/?#\\%\x00-\x1f\x7f]+(?:\/[^/?#\\%\x00-\x1f\x7f]+)*)?$/;
const safePath = (path) => typeof path === 'string' && route.test(path) &&
  !/^\/(?:api|_nuxt|__nuxt_error|healthz)(?:\/|$)/i.test(path) &&
  path.split('/').every((segment) => segment !== '.' && segment !== '..');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const link = { label: '', path: '' };
const image = { title: '', image: '' };
const preset = {
  id: '', version: '', name: '', description: '',
  theme: { background: '', foreground: '', accent: '', muted: '', font: '' },
  demo: {
    brand: '', 'contactEmail?': '', hero: { ...image, subtitle: '' },
    product: { ...image, price: '', description: '' },
    collection: { ...image, description: '' }, page: { ...image, body: '' },
  },
  'showcase?': {
    eyebrow: '', heroLabel: '', stats: [{ value: '', label: '' }],
    products: [{ ...image, price: '', description: '' }],
    solutions: [{ title: '', description: '', image: '' }], faq: [{ question: '', answer: '' }],
  },
};
const content = {
  kind: 'preset-page', view: '', preset, sections: [''], seo: { title: '', description: '' },
  'items?': [{ ...link, image: '', description: '', price: '' }],
};
const snapshotShape = {
  schemaVersion: 1, workspaceId: '', siteId: '', language: '',
  pages: [{ path: '', pageKey: '', entryId: '', content }],
  navigation: [link], redirects: [{ from: '', to: '' }],
};
const envelopeShape = {
  schemaVersion: 1, workspaceId: '', siteId: '', releaseId: '', checksum: '', snapshot: snapshotShape,
};

function matches(value, shape) {
  if (Array.isArray(shape)) return Array.isArray(value) && value.every((item) => matches(item, shape[0]));
  if (object(shape)) {
    if (!object(value)) return false;
    const keys = Object.keys(shape);
    if (Object.keys(value).some((key) => !keys.includes(key) && !keys.includes(`${key}?`))) return false;
    return keys.every((key) => key.endsWith('?') && value[key.slice(0, -1)] === undefined ||
      matches(value[key.endsWith('?') ? key.slice(0, -1) : key], shape[key]));
  }
  return shape === '' ? typeof value === 'string' : value === shape;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
  return value;
}

export function publishedPage(response, workspaceId, siteId, path) {
  if (!workspaceId || !siteId || !safePath(path) || !matches(response, envelopeShape)) return null;
  const { snapshot } = response;
  if (!response.workspaceId || !response.siteId || !response.releaseId ||
      response.workspaceId !== workspaceId || response.siteId !== siteId ||
      snapshot.workspaceId !== workspaceId || snapshot.siteId !== siteId || !snapshot.language ||
      !/^[a-f0-9]{64}$/.test(response.checksum) ||
      createHash('sha256').update(JSON.stringify(canonical(snapshot)), 'utf8').digest('hex') !== response.checksum) return null;
  const pages = new Map();
  for (const page of snapshot.pages) {
    const view = page.path === '/' ? 'home' : page.path === '/collections' ? 'collection' :
      page.path.startsWith('/products/') ? 'product' : 'page';
    if (!safePath(page.path) || pages.has(page.path) || !page.entryId || !page.pageKey ||
        page.content.view !== view || !page.content.seo.title) return null;
    pages.set(page.path, page);
  }
  const page = pages.get(path);
  if (!page) {
    const redirect = snapshot.redirects.find((item) => item.from === path);
    return redirect && safePath(redirect.to) && pages.has(redirect.to) && !pages.has(redirect.from)
      ? { redirect: redirect.to } : null;
  }
  const { view, preset, sections, seo, items = [] } = page.content;
  return {
    path, language: snapshot.language, content: { view, preset: { demo: preset.demo, showcase: preset.showcase }, sections, seo },
    navigation: snapshot.navigation.filter((item) => pages.has(item.path)).map(({ label, path }) => ({ label, path })),
    items: items.filter((item) => pages.has(item.path)).map(({ label, path, image, description, price }) =>
      ({ label, path, image, description, price })),
  };
}

export async function fetchPublishedPage({ gatewayUrl, workspaceId, siteId, credential, path, fetcher = fetch }) {
  if (!gatewayUrl || !workspaceId || !siteId || !credential || !safePath(path)) return null;
  const url = new URL(`/sites/${encodeURIComponent(siteId)}/published-release`, gatewayUrl);
  const response = await fetcher(url, { headers: { authorization: `Bearer ${credential}` } });
  if (!response.ok) throw new Error(`Published gateway returned ${response.status}`);
  return publishedPage(await response.json(), workspaceId, siteId, path);
}
