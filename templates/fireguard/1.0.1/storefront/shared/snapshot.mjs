import { richNodes } from './rich-content.mjs';
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
const record = value => object(value);
const operationsShape = { seoTitle: '', seoDescription: '', contactFormEnabled: false, 'socialImageUrl?': '', 'faviconUrl?': '', 'analyticsId?': '', 'socialImage?': { _id: '' }, 'favicon?': { _id: '' } };
const layoutShape = { version: 1, mode: 'template', root: [{ id: '', kind: 'section', type: '', enabled: false, props: record, children: value => Array.isArray(value) && value.length === 0 }] };
const content = {
  kind: 'preset-page', view: '', preset, sections: [''], seo: { title: '', description: '' },
  'sectionConfigs?': [{ type: '', enabled: false, data: record }],
  'layoutDocument?': layoutShape,
  'items?': [{ ...link, image: '', description: '', price: '' }],
  'operations?': operationsShape,
};
export const snapshotShape = {
  schemaVersion: 1, workspaceId: '', siteId: '', language: '',
  'contractVersion?': 1,
  'template?': { id: '', version: '' },
  pages: [{ path: '', pageKey: '', entryId: '', content, 'layoutDocument?': layoutShape }],
  navigation: [link], redirects: [{ from: '', to: '' }],
  'operations?': operationsShape,
  'assets?': [{ path: '', checksum: '', mimeType: '', 'contentBase64?': '', 'url?': '', 'mediaId?': '', 'sourcePath?': '' }],
};
export function matches(value, shape) {
  if (typeof shape === 'function') return shape(value);
  if (Array.isArray(shape)) return Array.isArray(value) && value.every((item) => matches(item, shape[0]));
  if (object(shape)) {
    if (!object(value)) return false;
    const keys = Object.keys(shape);
    if (Object.keys(value).some((key) => !keys.includes(key) && !keys.includes(`${key}?`))) return false;
    return keys.every((key) => key.endsWith('?') && value[key.slice(0, -1)] === undefined ||
      matches(value[key.endsWith('?') ? key.slice(0, -1) : key], shape[key]));
  }
  if (shape === '') return typeof value === 'string';
  if (shape === true || shape === false) return typeof value === 'boolean';
  return value === shape;
}

const sectionOptions = {
  home: ['hero', 'feature'], collection: ['heading', 'grid'],
  product: ['gallery', 'information', 'description'], page: ['story'],
};
function safeTheme(theme) {
  return ['background', 'foreground', 'accent', 'muted'].every((key) => /^#[a-f0-9]{6}$/i.test(theme[key])) &&
    /^[a-z0-9 ,"'-]{1,120}$/i.test(theme.font);
}

export function normalizeContractSnapshot(snapshot) {
  if (!object(snapshot) || snapshot.contractVersion !== 1 || snapshot.template?.id !== 'fireguard' || snapshot.template?.version !== '1.0.1') return null;
  const keys = ['contractVersion', 'schemaVersion', 'workspaceId', 'siteId', 'language', 'template', 'pages', 'navigation', 'redirects', 'operations', 'assets'];
  if (Object.keys(snapshot).some(key => !keys.includes(key)) || !Array.isArray(snapshot.pages) || snapshot.pages.some(page => page?.content?.preset?.id !== 'fireguard' || page?.content?.preset?.version !== '1.0.1')) return null;
  const ids = new Set();
  function navigation(nodes) {
    if (!Array.isArray(nodes)) throw new Error('Invalid navigation');
    return nodes.flatMap(node => {
      if (!object(node) || Object.keys(node).some(key => !['id', 'label', 'path', 'href', 'enabled', 'children'].includes(key)) || typeof node.label !== 'string') throw new Error('Invalid navigation');
      // Legacy flat navigation is accepted only by the legacy snapshot branch.
      if (typeof node.id !== 'string' || !node.id || ids.has(node.id) || typeof node.enabled !== 'boolean') throw new Error('Invalid navigation');
      ids.add(node.id);
      if (node.path !== undefined && node.href !== undefined && node.path !== node.href) throw new Error('Invalid navigation');
      const children = navigation(node.children ?? []);
      const path = node.href ?? node.path;
      if (path !== undefined && !safePath(path)) throw new Error('Invalid navigation');
      return node.enabled ? [...(path ? [{ label: node.label, path }] : []), ...children] : [];
    });
  }
  try { return { ...snapshot, navigation: navigation(snapshot.navigation) }; } catch { return null; }
}

const sectionProps = { hero: { title: 'text', image: 'media', showButton: 'boolean', buttonHref: 'text' }, feature: { eyebrow: 'text' }, heading: { title: 'text' }, grid: { columns: 'number' }, gallery: { image: 'media' }, information: { title: 'text', price: 'text' }, description: { body: 'rich-text' }, story: { title: 'text', body: 'rich-text', image: 'media' } };
function richText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(richText).filter(Boolean).join(' ');
  if (object(value)) return typeof value.text === 'string' ? value.text : richText(value.content ?? value.nodes);
  return '';
}
// Public references resolve only to embedded, validated release assets. Preview
// references must already have been resolved by the authorized CMS boundary.
function mediaValue(value, assets, preview, enabled = true) {
  let id;
  if (object(value)) {
    if (Object.keys(value).length !== 1 || typeof value._id !== 'string' || !value._id) return undefined;
    if (!enabled) return value;
    if (preview) return undefined;
    id = value._id;
  } else if (typeof value === 'string') {
    if (value && !/^(?:https?:\/\/|\/(?!\/))/.test(value)) return undefined;
    if (!enabled || preview || !value) return value;
    let url;
    try { url = new URL(value, 'https://artifact.invalid'); } catch { return undefined; }
    const match = /^\/api\/v4\/media\/([^/]+)\/bin\/[^/]+$/.exec(url.pathname);
    if (!match) return value;
    try { id = decodeURIComponent(match[1]); } catch { return undefined; }
  } else return undefined;
  const found = (assets || []).filter(asset => asset.mediaId === id);
  if (found.length !== 1) return undefined;
  const asset = found[0];
  if (!asset.mimeType.startsWith('image/') || !safePath('/' + asset.path) || asset.path.startsWith('/') || asset.path.includes('..') ||
      typeof asset.contentBase64 !== 'string' || !asset.contentBase64 || !/^sha256:[a-f0-9]{64}$/.test(asset.checksum) ||
      asset.url !== undefined && asset.url !== '/_assets/' + asset.path) return undefined;
  return '/_assets/' + asset.path;
}
function sectionValues(content, pageLayout, assets, preview, paths) {
  const layout = pageLayout ?? content.layoutDocument;
  const values = structuredClone(layout ? layout.root.map(node => ({ type: node.type, enabled: node.enabled, data: node.props })) : content.sectionConfigs);
  if (!values) return { sections: content.sections, preset: content.preset };
  const seen = new Set();
  for (const section of values) {
    const declared = sectionProps[section.type];
    if (!declared || !content.sections.includes(section.type) || seen.has(section.type)) return null;
    seen.add(section.type);
    for (const [key, value] of Object.entries(section.data)) {
      const control = declared[key];
      if (!control || control === 'boolean' && typeof value !== 'boolean' || control === 'text' && typeof value !== 'string' || control === 'number' && (!Number.isInteger(value) || value < 1) || control === 'rich-text' && typeof value !== 'string' && !object(value) && !Array.isArray(value)) return null;
      if (control === 'rich-text' && !richNodes(value, paths)) return null;
      if (control === 'media') {
        const resolved = mediaValue(value, assets, preview, section.enabled);
        if (resolved === undefined) return null;
        section.data[key] = resolved;
      }
    }
  }
  const preset = structuredClone(content.preset);
  let richBody;
  let columns;
  let showHeroButton = true;
  let heroButtonHref;
  for (const { type, enabled, data } of values) {
    if (!enabled) continue;
    if (type === 'hero') { showHeroButton = data.showButton ?? true; heroButtonHref = data.buttonHref; if (heroButtonHref !== undefined && (typeof heroButtonHref !== 'string' || !/^(?:https?:\/\/|\/(?!\/))/.test(heroButtonHref) || heroButtonHref.includes('\\'))) return null; if (data.title !== undefined) preset.demo.hero.title = data.title; if (data.image !== undefined) preset.demo.hero.image = data.image; }
    if (type === 'feature' && data.eyebrow !== undefined) preset.showcase = { ...preset.showcase, eyebrow: data.eyebrow };
    if (type === 'heading' && data.title !== undefined) preset.demo.collection.title = data.title;
    if (type === 'grid') columns = data.columns ?? 3;
    if (type === 'gallery' && data.image !== undefined) preset.demo.product.image = data.image;
    if (type === 'information') { if (data.title !== undefined) preset.demo.product.title = data.title; if (data.price !== undefined) preset.demo.product.price = data.price; }
    if (type === 'description' && data.body !== undefined) { preset.demo.product.description = richText(data.body); richBody=richNodes(data.body,paths); }
    if (type === 'story') { if (data.title !== undefined) preset.demo.page.title = data.title; if (data.body !== undefined) { preset.demo.page.body = richText(data.body); richBody=richNodes(data.body,paths); } if (data.image !== undefined) preset.demo.page.image = data.image; }
  }
  return { ...(richBody ? { richBody } : {}), sections: values.filter(value => value.enabled).map(value => value.type), preset, showHeroButton, heroButtonHref, ...(columns ? { columns } : {}) };
}

export function snapshotPage(snapshot, path, { preview = false } = {}) {
  if (!safePath(path) || !matches(snapshot, snapshotShape) || !snapshot.workspaceId || !snapshot.siteId || !snapshot.language) return null;
  const richPaths = new Set([...snapshot.pages.map(page=>page.path),...snapshot.redirects.map(redirect=>redirect.from),...(snapshot.assets || []).map(asset=>'/_assets/'+asset.path).filter(safePath)]);
  const pages = new Map();
  for (const page of snapshot.pages) {
    const { view, preset, sections } = page.content;
    if (!safePath(page.path) || pages.has(page.path) || !page.entryId || !page.pageKey ||
        !Object.hasOwn(sectionOptions, view) || !safeTheme(preset.theme) ||
        new Set(sections).size !== sections.length || sections.some((section) => !sectionOptions[view].includes(section)) ||
        !page.content.seo.title) return null;
    if (!sectionValues(page.content, page.layoutDocument, snapshot.assets, preview, richPaths)) return null;
    pages.set(page.path, page);
  }
  const page = pages.get(path);
  if (!page) {
    const redirect = snapshot.redirects.find((item) => item.from === path);
    return redirect && safePath(redirect.to) && pages.has(redirect.to) && !pages.has(redirect.from)
      ? { redirect: redirect.to } : null;
  }
  const { view, seo, items = [] } = page.content;
  const { preset, sections, columns, showHeroButton, heroButtonHref, richBody } = sectionValues(page.content, page.layoutDocument, snapshot.assets, preview, richPaths);
  const publicOperations = (value) => value && typeof value === 'object' ? {
    ...(typeof value.seoTitle === 'string' ? { seoTitle: value.seoTitle } : {}),
    ...(typeof value.seoDescription === 'string' ? { seoDescription: value.seoDescription } : {}),
    ...(typeof value.analyticsId === 'string' ? { analyticsId: value.analyticsId } : {}),
    ...(typeof value.contactFormEnabled === 'boolean' ? { contactFormEnabled: value.contactFormEnabled } : {}),
    ...(typeof value.socialImageUrl === 'string' ? { socialImageUrl: value.socialImageUrl } : {}),
    ...(typeof value.faviconUrl === 'string' ? { faviconUrl: value.faviconUrl } : {}),
  } : undefined;
  const operations = publicOperations(page.content.operations || snapshot.operations);
  return {
    path, language: snapshot.language, siteId: snapshot.siteId,
    links: { home: snapshot.pages.find((item) => item.content.view === 'home')?.path || '/',
      collection: snapshot.pages.find((item) => item.content.view === 'collection')?.path || '/',
      company: snapshot.pages.find((item) => item.content.view === 'page')?.path || '/' },
    content: { view, ...(richBody ? { richBody } : {}), ...(showHeroButton !== undefined ? { showHeroButton } : {}), ...(heroButtonHref !== undefined ? { heroButtonHref } : {}), ...(columns ? { columns } : {}), preset: { theme: preset.theme, demo: preset.demo, showcase: preset.showcase }, sections, seo,
      ...(operations && Object.keys(operations).length ? { operations } : {}) },
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
  if (snapshot.contractVersion === 1) snapshot = normalizeContractSnapshot(snapshot);
  else if (snapshot.templateVersion !== undefined || snapshot.mediaIds !== undefined || snapshot.navigation?.some(node => node.children !== undefined)) {
    const { templateVersion, mediaIds, ...release } = snapshot;
    if (templateVersion !== undefined && templateVersion !== '1.0.1' || mediaIds !== undefined && (!Array.isArray(mediaIds) || mediaIds.some(id => typeof id !== 'string'))) return null;
    const contract = normalizeContractSnapshot({ ...release, contractVersion: 1, template: { id: 'fireguard', version: '1.0.1' }, assets: [] });
    if (!contract) return null;
    const { contractVersion, template, assets, ...projected } = contract;
    snapshot = projected;
  }
  if (!snapshot || !matches(snapshot, snapshotShape) || snapshot.pages.some((page) =>
    page.content.preset.id !== 'fireguard' || page.content.preset.version !== '1.0.1')) return null;
  return snapshotPage(snapshot, path, { preview: true });
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


// NuxtLink includes app.baseURL in href; snapshot routes remain site-relative.
// Keep query/hash bytes intact for the existing resolver to handle.
export function previewNavigationPath(href, baseURL) {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return null;
  if (typeof baseURL === 'string' && baseURL !== '/' && baseURL.startsWith('/') &&
      !baseURL.startsWith('//') && baseURL.endsWith('/') && !/[?#]/.test(baseURL) && href.startsWith(baseURL)) {
    const path = '/' + href.slice(baseURL.length);
    return path.startsWith('//') ? null : path;
  }
  return href;
}
