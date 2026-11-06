import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalChecksum, validateManifest } from '../scripts/validate.mjs';

const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
const digest = createHash('sha256').update(png).digest('hex');
const asset = { path: 'assets/hero.png', checksum: digest, mimeType: 'image/png' };
const field = (key, type = 'STRING', referenceModel) => ({ key, label: key, type, required: false, array: false, ...(referenceModel ? { referenceModel } : {}) });
const manifest = () => ({
  schemaVersion: 1, id: 'aeroframe', version: '1.0.4', name: 'AeroFrame', description: 'Aircraft',
  compatibility: { cmsSchema: 1, releaseSchema: 1, migrations: [] },
  editor: {
    schemaVersion: 1,
    models: [{ modelKey: 'home', fields: [{ key: 'title', label: 'Title', control: 'text', group: 'Content', description: 'Page title', default: 'Home' }] }],
    pages: [{ pageKey: 'home', modelKey: 'home', pathRule: { type: 'fixed', value: '/' }, allowNavigation: true, sections: ['hero'] }],
    sections: [{ type: 'hero', label: 'Hero', allowedPages: ['home'], singleton: true, required: true, props: { title: { control: 'text', required: true } } }],
    operations: { canCreatePages: true, canEditNavigation: true, canPublish: true },
  },
  renderer: {
    contractVersion: 1, templateId: 'aeroframe', templateVersion: '1.0.4',
    preview: { protocolVersion: 1, capabilities: ['select-node', 'hover-node'] },
    assets: { mode: 'published', basePath: '/_assets/' },
  },
  presentation: { theme: { background: '#080d14', foreground: '#f3f6fa', accent: '#4f7dff', muted: '#182432', font: 'Arial, sans-serif' }, demo: { brand: 'AEROWORKS', hero: { title: 'Mission', subtitle: 'Ready', image: 'https://example.test/hero.jpg' }, product: { title: 'Drone', price: '$10', image: 'https://example.test/p.jpg', description: 'A product' }, collection: { title: 'Fleet', description: 'Aircraft', image: 'https://example.test/c.jpg' }, page: { title: 'About', body: 'About us', image: 'https://example.test/a.jpg' } } },
  models: [
    { key: 'home', label: 'Home', description: '', singleEntry: true, fields: [field('title'), field('products', 'ENTRY_POINTER', 'product')] },
    { key: 'product', label: 'Products', description: '', singleEntry: false, fields: [field('title')] },
  ],
  pages: [{ key: 'home', title: 'Home', path: '/', modelKey: 'home', layout: 'home' }],
  assets: [{ ...asset }],
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'template-validation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, asset.path), png);
  return root;
}

test('canonical SHA-256 matches CMS UTF-8 and recursive key ordering', () => {
  assert.equal(canonicalChecksum({ b: 'é', a: [{ z: 1, x: 2 }, 3] }), '371f0dd6b78043fdcfcc13eae4216508162eed0b80dd243be24dfa467037510c');
});

test('accepts a v1 manifest and verified local asset', async (t) => {
  const root = await fixture(t);
  assert.deepEqual(await validateManifest(manifest(), root), manifest());
});

test('rejects unknown/missing fields and incompatible versions', async (t) => {
  const root = await fixture(t);
  for (const change of [
    (m) => { m.script = 'https://evil.test/payload.js'; },
    (m) => { m.imageDigest = `sha256:${'0'.repeat(64)}`; },
    (m) => { delete m.assets; },
    (m) => { m.models[0].fields[0].extra = true; },
    (m) => { m.schemaVersion = 2; },
    (m) => { m.compatibility.cmsSchema = 2; },
    (m) => { m.compatibility.releaseSchema = 2; },
    (m) => { m.models[0].fields[0].type = 1; },
  ]) {
    const candidate = manifest(); change(candidate);
    await assert.rejects(validateManifest(candidate, root));
  }
});

test('rejects duplicate model/field/page keys and conflicting page paths', async (t) => {
  const root = await fixture(t);
  for (const change of [
    (m) => m.models.push({ ...m.models[0] }),
    (m) => m.models[0].fields.push({ ...m.models[0].fields[0] }),
    (m) => m.pages.push({ ...m.pages[0], path: '/other' }),
    (m) => m.pages.push({ ...m.pages[0], key: 'other' }),
    (m) => { m.pages[0].path = '/pages/:slug'; m.pages.push({ ...m.pages[0], key: 'other', path: '/pages/foo' }); },
    (m) => { m.pages[0].path = '/pages/:slug'; m.pages.push({ ...m.pages[0], key: 'other', path: '/pages/:id' }); },
    (m) => m.assets.push({ ...m.assets[0] }),
  ]) {
    const candidate = manifest(); change(candidate);
    await assert.rejects(validateManifest(candidate, root));
  }
});

test('rejects invalid references, reserved routes and malformed routes', async (t) => {
  const root = await fixture(t);
  for (const change of [
    (m) => { m.pages[0].modelKey = 'missing'; },
    (m) => { m.models[0].fields[1].referenceModel = 'missing'; },
    (m) => { delete m.models[0].fields[1].referenceModel; },
    (m) => { m.models[0].fields[0].referenceModel = 'product'; },
    ...['/api', '/preview/items', '/presets/a', '/products/foo', '//evil.test'].map((path) => (m) => { m.pages[0].path = path; m.editor.pages[0].pathRule.value = path; }),
  ]) {
    const candidate = manifest(); change(candidate);
    await assert.rejects(validateManifest(candidate, root));
  }
  const candidate = manifest(); candidate.pages[0].path = '/products/:slug'; candidate.editor.pages[0].pathRule = { type: 'fixed', value: '/products/:slug' };
  await validateManifest(candidate, root);
});

test('rejects missing, tampered, mismatched or executable assets', async (t) => {
  const root = await fixture(t);
  for (const change of [
    (m) => { m.assets[0].path = 'assets/missing.png'; },
    (m) => { m.assets[0].checksum = '0'.repeat(64); },
    (m) => { m.assets[0].mimeType = 'image/jpeg'; },
    (m) => { m.assets[0].path = 'assets/code.js'; },
    (m) => { m.assets[0].path = 'assets/code.svg'; },
    (m) => { m.assets[0].path = 'assets/code.exe.png'; },
    (m) => { m.assets[0].path = 'https://evil.test/hero.png'; },
    (m) => { m.assets[0].path = '../hero.png'; },
  ]) {
    const candidate = manifest(); change(candidate);
    await assert.rejects(validateManifest(candidate, root));
  }
  await writeFile(join(root, asset.path), Buffer.from('not a PNG'));
  await assert.rejects(validateManifest(manifest(), root));
});

test('rejects symlinked asset files', async (t) => {
  const root = await fixture(t);
  try {
    await symlink(join(root, asset.path), join(root, 'assets', 'link.png'));
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'ENOTSUP') return t.skip('OS does not allow creating file symlinks');
    throw error;
  }
  const candidate = manifest(); candidate.assets[0].path = 'assets/link.png';
  await assert.rejects(validateManifest(candidate, root));
});

test('rejects symlinked parent directories', async (t) => {
  const root = await fixture(t);
  try {
    await symlink(join(root, 'assets'), join(root, 'linked'), 'junction');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'ENOTSUP') return t.skip('OS does not allow creating directory links');
    throw error;
  }
  const candidate = manifest(); candidate.assets[0].path = 'linked/hero.png';
  await assert.rejects(validateManifest(candidate, root));
});

test('checked-in AeroFrame manifest retains the CMS field specs and page mappings', async () => {
  const root = new URL('../templates/aeroframe/1.0.0/', import.meta.url);
  const candidate = JSON.parse(await readFile(new URL('template.json', root), 'utf8'));
  await validateManifest(candidate, root);
  const fieldSpec = (key, type = 'STRING', required = false, array = false, referenceModel) =>
    [key, type, required, array, referenceModel];
  assert.deepEqual(candidate.models.map(({ key }) => key), ['product', 'collection', 'home', 'content-page', 'site-settings']);
  assert.deepEqual(candidate.models.map(({ fields }) => fields.map(({ key, type, required, array, referenceModel }) =>
    [key, type, required, array, referenceModel])), [
    [fieldSpec('title', 'STRING', true), fieldSpec('slug', 'STRING', true), fieldSpec('price', 'NUMBER', true),
      fieldSpec('description'), fieldSpec('images', 'MEDIA', false, true), fieldSpec('sku')],
    [fieldSpec('title', 'STRING', true), fieldSpec('slug', 'STRING', true), fieldSpec('description'),
      fieldSpec('cover', 'MEDIA'), fieldSpec('products', 'ENTRY_POINTER', false, true, 'product')],
    [fieldSpec('title', 'STRING', true), fieldSpec('slug', 'STRING', true), fieldSpec('headline', 'STRING', true),
      fieldSpec('intro'), fieldSpec('heroImage', 'MEDIA'),
      fieldSpec('featuredCollections', 'ENTRY_POINTER', false, true, 'collection'),
      fieldSpec('featuredProducts', 'ENTRY_POINTER', false, true, 'product')],
    [fieldSpec('title', 'STRING', true), fieldSpec('slug', 'STRING', true), fieldSpec('summary'),
      fieldSpec('cover', 'MEDIA'), fieldSpec('body', 'RICH_TEXT'), fieldSpec('seoDescription')],
    [fieldSpec('title', 'STRING', true), fieldSpec('slug', 'STRING', true), fieldSpec('brandName', 'STRING', true),
      fieldSpec('logo', 'MEDIA'), fieldSpec('announcement'), fieldSpec('contactEmail'),
      fieldSpec('navigationPages', 'ENTRY_POINTER', false, true, 'content-page')],
  ]);
  assert.deepEqual(candidate.pages.map(({ key, path, modelKey, layout }) => [key, path, modelKey, layout]), [
    ['home', '/', 'home', 'home'],
    ['collections', '/collections', 'collection', 'collection-list'],
    ['product', '/products/:slug', 'product', 'product-detail'],
    ['content', '/pages/:slug', 'content-page', 'content-page'],
  ]);
});

test('requires CMS presentation data for a public template manifest', async (t) => {
  const root = await fixture(t);
  const candidate = manifest();
  candidate.version = '1.0.5';
  candidate.renderer.templateVersion = candidate.version;
  await validateManifest(candidate, root);
  delete candidate.presentation;
  await assert.rejects(validateManifest(candidate, root), /presentation/i);
});

test('requires editor and renderer contracts for current public releases', async (t) => {
  const root = await fixture(t);
  const candidate = manifest();
  delete candidate.editor;
  await assert.rejects(validateManifest(candidate, root), /editor/i);
  const second = manifest();
  delete second.renderer;
  await assert.rejects(validateManifest(second, root), /renderer/i);
});

test('rejects editor references to unknown models, pages and sections', async (t) => {
  const root = await fixture(t);
  for (const change of [
    (m) => { m.editor.models[0].modelKey = 'missing'; },
    (m) => { m.editor.pages[0].pageKey = 'missing'; },
    (m) => { m.editor.pages[0].sections = ['missing']; },
    (m) => { m.editor.sections[0].allowedPages = ['missing']; },
    (m) => { m.editor.pages[0].pathRule = { type: 'pattern', value: '/bad/:slug/:slug' }; },
    (m) => { m.renderer.contractVersion = 2; },
  ]) {
    const candidate = manifest(); change(candidate);
    await assert.rejects(validateManifest(candidate, root));
  }
});

test('rejects duplicate editor declarations and invalid migration identities', async (t) => {
  const root = await fixture(t);
  for (const change of [
    (m) => { m.editor.models.push({ ...m.editor.models[0] }); },
    (m) => { m.editor.pages.push({ ...m.editor.pages[0], pageKey: 'other' }); },
    (m) => { m.editor.sections.push({ ...m.editor.sections[0] }); },
    (m) => { m.compatibility.migrations.push({ from: 'aeroframe@1.0.0', to: 'other@1.0.1', steps: [] }); },
    (m) => { m.compatibility.migrations.push({ from: 'other@1.0.0', to: 'aeroframe@1.0.0', steps: [] }); },
  ]) {
    const candidate = manifest(); change(candidate);
    await assert.rejects(validateManifest(candidate, root));
  }
});

test('checked-in current manifests declare editor and renderer identities', async () => {
  for (const path of ['../templates/aeroframe/1.0.4/template.json', '../templates/fireguard/1.0.1/template.json']) {
    const root = new URL(path.replace('template.json', ''), import.meta.url);
    const candidate = JSON.parse(await readFile(new URL('template.json', root), 'utf8'));
    await validateManifest(candidate, root);
    assert.equal(candidate.editor.schemaVersion, 1);
    assert.equal(candidate.renderer.contractVersion, 1);
    assert.equal(candidate.renderer.templateId, candidate.id);
    assert.equal(candidate.renderer.templateVersion, candidate.version);
  }
});


test('immutable legacy manifests still validate without editor or renderer contracts', async () => {
  for (const version of ['1.0.0', '1.0.1', '1.0.2', '1.0.3']) {
    const root = new URL(`../templates/aeroframe/${version}/`, import.meta.url);
    const candidate = JSON.parse(await readFile(new URL('template.json', root), 'utf8'));
    assert.equal(candidate.editor, undefined);
    await validateManifest(candidate, root);
  }
  const root = new URL('../templates/fireguard/1.0.0/', import.meta.url);
  const candidate = JSON.parse(await readFile(new URL('template.json', root), 'utf8'));
  assert.equal(candidate.editor, undefined);
  await validateManifest(candidate, root);
});
