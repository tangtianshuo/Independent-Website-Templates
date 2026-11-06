import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as published from '../server/utils/published.mjs';

const manifest = JSON.parse(await readFile(new URL('../../template.json', import.meta.url)));
const content = { kind: 'preset-page', view: 'collection', preset: { id: 'aeroframe', version: '1.0.4', name: manifest.name, description: manifest.description, ...manifest.presentation }, sections: ['grid', 'heading'], seo: { title: 'Private catalog', description: '' }, items: [] };
const snapshot = { schemaVersion: 1, workspaceId: 'cms-workspace', siteId: 'cms-site', language: 'en', pages: [{ path: '/catalog', pageKey: 'collections', entryId: 'cms-entry', content }], navigation: [{ label: 'Catalog', path: '/catalog' }], redirects: [] };

test('preview accepts actual CMS snapshot and preset-site wrapper using published normalization', () => {
  assert.equal(typeof published.previewPage, 'function');
  for (const value of [snapshot, { kind: 'preset-site', siteName: 'Private site', ...snapshot }]) {
    const page = published.previewPage(value, '/catalog');
    assert.equal(page.content.view, 'collection');
    assert.equal(page.content.seo.title, 'Private catalog');
    assert.equal(page.content.preset.theme.accent, '#4f7dff');
    assert.deepEqual(page.content.sections, ['grid', 'heading']);
    assert.equal(page.entryId, undefined);
  }
});

test('preview rejects unknown payload fields, unsafe themes, duplicate paths and invalid views', () => {
  assert.equal(typeof published.previewPage, 'function');
  for (const mutate of [
    value => { value.extra = 'private'; },
    value => { value.pages.push(structuredClone(value.pages[0])); },
    value => { value.pages[0].content.view = 'unexpected'; },
    value => { value.pages[0].content.preset.theme.font = 'Arial; color:red'; },
    value => { value.pages[0].content.sections = ['unknown']; },
    value => { value.pages[0].path = '/preview'; },
  ]) {
    const value = structuredClone(snapshot); mutate(value);
    assert.equal(published.previewPage(value, '/catalog'), null);
  }
});

test('preview messages require exact configured admin origin and the embedding parent', async () => {
  const preview = await import('../shared/snapshot.mjs');
  assert.equal(typeof preview.acceptPreviewMessage, 'function');
  const parent = {}; const self = {};
  const context = { adminOrigin: 'https://cms.example.com', parent, self };
  const event = { origin: 'https://cms.example.com', source: parent, data: { type: 'storefront:preview', payload: { kind: 'preset-site', siteName: 'CMS', ...snapshot } } };
  assert.equal(preview.acceptPreviewMessage(event, context)?.page.path, '/catalog');
  assert.equal(preview.acceptPreviewMessage({ ...event, origin: 'https://cms.example.com.attacker.test' }, context), null);
  assert.equal(preview.acceptPreviewMessage({ ...event, source: {} }, context), null);
  assert.equal(preview.acceptPreviewMessage(event, { ...context, adminOrigin: '' }), null);
  assert.equal(preview.acceptPreviewMessage(event, { ...context, adminOrigin: 'https://cms.example.com/path' }), null);
  assert.equal(preview.acceptPreviewMessage(event, { ...context, self: parent }), null);
  assert.equal(preview.acceptPreviewMessage({ ...event, data: { type: 'other', payload: snapshot } }, context), null);
});

test('navigation targets use explicit view instead of fixed collection paths', () => {
  const page = published.previewPage(snapshot, '/catalog');
  assert.equal(page?.links?.collection, '/catalog');
});

test('preview shell is private, non-indexable and only framed by configured CMS origin', async () => {
  const preview = await import('../shared/snapshot.mjs');
  assert.equal(typeof preview.previewHeaders, 'function');
  const headers = preview.previewHeaders('https://cms.example.com');
  assert.equal(headers['cache-control'], 'no-store');
  assert.equal(headers['x-robots-tag'], 'noindex, nofollow, noarchive');
  assert.equal(headers['content-security-policy'], "frame-ancestors https://cms.example.com");
  assert.equal(preview.previewHeaders(''), null);
  assert.equal(preview.previewHeaders('https://cms.example.com/evil'), null);
});

test('preview refuses snapshots for a different template version or template identity', () => {
  for (const [id, version] of [['aeroframe', '1.0.2'], ['another-template', '1.0.4']]) {
    const value = structuredClone(snapshot);
    value.pages[0].content.preset.id = id;
    value.pages[0].content.preset.version = version;
    assert.equal(published.previewPage(value, '/catalog'), null);
  }
});


test('preview handshake announces this immutable manifest identity', async () => {
  const shell = await readFile(new URL('../pages/preview.vue', import.meta.url), 'utf8');
  assert.ok(shell.includes(`templateId: '${manifest.id}'`));
  assert.ok(shell.includes(`templateVersion: '${manifest.version}'`));
});


test('declared hero button controls preserve layout and reject unsafe links', async () => {
  const { previewPage } = await import('../shared/snapshot.mjs');
  const value = structuredClone(snapshot);
  value.pages[0].path = '/'; value.pages[0].pageKey = 'home';
  value.pages[0].content.view = 'home'; value.pages[0].content.sections = ['hero', 'feature'];
  value.pages[0].content.sectionConfigs = [{ type: 'hero', enabled: true, data: { title: 'Edited title', showButton: false, buttonHref: '/catalog' } }, { type: 'feature', enabled: true, data: {} }];
  const page = previewPage(value, '/');
  assert.equal(page.content.preset.demo.hero.title, 'Edited title');
  assert.equal(page.content.showHeroButton, false);
  assert.equal(page.content.heroButtonHref, '/catalog');
  value.pages[0].content.sectionConfigs[0].data.buttonHref = 'javascript:alert(1)';
  assert.equal(previewPage(value, '/'), null);
  const declaration = manifest.editor.sections.find(section => section.type === 'hero');
  assert.equal(declaration.props.title.label, '标题');
  assert.deepEqual(declaration.props.buttonHref.visibleWhen, { field: 'showButton', equals: true });
});


test('collection heading marker survives actual Vue template compilation', async () => {
  const { parse, compileTemplate } = await import('@vue/compiler-sfc');
  const source = await readFile(new URL('../components/AeroPage.vue', import.meta.url), 'utf8');
  const { descriptor } = parse(source);
  const compiled = compileTemplate({ source: descriptor.template.content, filename: 'AeroPage.vue', id: 'heading-marker' });
  assert.deepEqual(compiled.errors, []);
  assert.match(compiled.code, /"data-section-type": "heading"/);
});
