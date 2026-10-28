const route = /^\/(?:[^/?#\\%\x00-\x1f\x7f]+(?:\/[^/?#\\%\x00-\x1f\x7f]+)*)?$/;
export const safePath = (path) => typeof path === 'string' && route.test(path) &&
  !/^\/(?:api|_nuxt|__nuxt_error|healthz|preview)(?:\/|$)/i.test(path) &&
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
export const snapshotShape = {
  schemaVersion: 1, workspaceId: '', siteId: '', language: '',
  pages: [{ path: '', pageKey: '', entryId: '', content }],
  navigation: [link], redirects: [{ from: '', to: '' }],
};
export function matches(value, shape) {
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

const sectionOptions = {
  home: ['hero', 'feature'], collection: ['heading', 'grid'],
  product: ['gallery', 'information', 'description'], page: ['story'],
};
function safeTheme(theme) {
  return ['background', 'foreground', 'accent', 'muted'].every((key) => /^#[a-f0-9]{6}$/i.test(theme[key])) &&
    /^[a-z0-9 ,"'-]{1,120}$/i.test(theme.font);
}

export function snapshotPage(snapshot, path) {
  if (!safePath(path) || !matches(snapshot, snapshotShape) || !snapshot.workspaceId || !snapshot.siteId || !snapshot.language) return null;
  const pages = new Map();
  for (const page of snapshot.pages) {
    const { view, preset, sections } = page.content;
    if (!safePath(page.path) || pages.has(page.path) || !page.entryId || !page.pageKey ||
        !Object.hasOwn(sectionOptions, view) || !safeTheme(preset.theme) ||
        new Set(sections).size !== sections.length || sections.some((section) => !sectionOptions[view].includes(section)) ||
        !page.content.seo.title) return null;
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
    path, language: snapshot.language,
    links: { home: snapshot.pages.find((item) => item.content.view === 'home')?.path || '/',
      collection: snapshot.pages.find((item) => item.content.view === 'collection')?.path || '/',
      company: snapshot.pages.find((item) => item.content.view === 'page')?.path || '/' }, content: { view, preset: { theme: preset.theme, demo: preset.demo, showcase: preset.showcase }, sections, seo },
    navigation: snapshot.navigation.filter((item) => pages.has(item.path)).map(({ label, path }) => ({ label, path })),
    items: items.filter((item) => pages.has(item.path)).map(({ label, path, image, description, price }) =>
      ({ label, path, image, description, price })),
  };
}

export function previewPage(payload, path = '/') {
  if (!object(payload)) return null;
  let snapshot = payload;
  if (payload.kind === 'preset-site') {
    const { kind, siteName, ...value } = payload;
    if (siteName !== undefined && typeof siteName !== 'string') return null;
    snapshot = value;
  }
  if (!matches(snapshot, snapshotShape) || snapshot.pages.some((page) =>
    page.content.preset.id !== 'aeroframe' || page.content.preset.version !== '1.0.3')) return null;
  return snapshotPage(snapshot, path);
}

export function previewAdminOrigin(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value ? value : null;
  } catch { return null; }
}

export function acceptPreviewMessage(event, { adminOrigin, parent, self }) {
  if (!previewAdminOrigin(adminOrigin) || event.origin !== adminOrigin || parent === self || event.source !== parent) return null;
  const data = event.data;
  if (!object(data) || !['storefront:preview', 'cms:preview'].includes(data.type)) return null;
  const snapshot = data.type === 'storefront:preview' ? data.payload : data.snapshot;
  const path = data.path ?? (Array.isArray(snapshot?.pages) && snapshot.pages.find((page) => page.path === '/')?.path) ?? snapshot?.pages?.[0]?.path;
  const page = previewPage(snapshot, path);
  return page ? { snapshot, page, path } : null;
}

export function previewHeaders(adminOrigin) {
  return previewAdminOrigin(adminOrigin) ? {
    'cache-control': 'no-store',
    'x-robots-tag': 'noindex, nofollow, noarchive',
    'content-security-policy': `frame-ancestors ${adminOrigin}`,
    'referrer-policy': 'no-referrer',
  } : null;
}
