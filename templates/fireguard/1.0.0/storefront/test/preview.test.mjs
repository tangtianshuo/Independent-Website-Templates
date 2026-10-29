import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as published from '../server/utils/published.mjs';

const manifest = JSON.parse(await readFile(new URL('../../template.json', import.meta.url)));
const content = { kind: 'preset-page', view: 'collection', preset: { id: 'fireguard', version: '1.0.0', name: manifest.name, description: manifest.description, ...manifest.presentation }, sections: ['grid', 'heading'], seo: { title: 'Private catalog', description: '' }, items: [] };
const snapshot = { schemaVersion: 1, workspaceId: 'cms-workspace', siteId: 'cms-site', language: 'en', pages: [{ path: '/catalog', pageKey: 'collections', entryId: 'cms-entry', content }], navigation: [{ label: 'Catalog', path: '/catalog' }], redirects: [] };

test('preview accepts actual CMS snapshot and preset-site wrapper using published normalization', () => {
  assert.equal(typeof published.previewPage, 'function');
  for (const value of [snapshot, { kind: 'preset-site', siteName: 'Private site', ...snapshot }]) {
    const page = published.previewPage(value, '/catalog');
    assert.equal(page.content.view, 'collection');
    assert.equal(page.content.seo.title, 'Private catalog');
    assert.equal(page.content.preset.theme.accent, '#b92323');
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
  for (const [id, version] of [['fireguard', '1.0.2'], ['another-template', '1.0.0']]) {
    const value = structuredClone(snapshot);
    value.pages[0].content.preset.id = id;
    value.pages[0].content.preset.version = version;
    assert.equal(published.previewPage(value, '/catalog'), null);
  }
});
