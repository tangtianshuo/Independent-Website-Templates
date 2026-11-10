import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as published from '../server/utils/published.mjs';

const manifest = JSON.parse(await readFile(new URL('../../template.json', import.meta.url)));
const presentation = {"theme":{"background":"#080d14","foreground":"#f3f6fa","accent":"#4f7dff","muted":"#182432","font":"Arial, sans-serif"},"demo":{"brand":"AEROWORKS","contactEmail":"sales@example.com","hero":{"title":"Built for the missions ahead","subtitle":"Reliable aerial systems for demanding work in the real world.","image":"https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&w=2400&q=88"},"product":{"title":"Aero X8 industrial platform","price":"$8,490","image":"https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=1400&q=85","description":"A modular multirotor platform built for inspection, mapping, and rapid deployment."},"collection":{"title":"Aircraft systems","description":"Field-ready platforms for inspection, mapping, and response teams.","image":"https://flipandsteep.in/assets/images/course-fixed-wing-fly.png"},"page":{"title":"Engineering in the field","body":"We build dependable unmanned systems around the work operators need to complete.","image":"https://drone-safe-register-public.s3.eu-west-2.amazonaws.com/11731/drones-and-wind-turbins.jpg"}},"showcase":{"eyebrow":"UNMANNED SYSTEMS / FIELD PROVEN","heroLabel":"AERIAL SYSTEMS FOR COMPLEX MISSIONS","stats":[{"value":"25 min","label":"Rapid deployment"},{"value":"12 kg","label":"Payload capacity"},{"value":"IP54","label":"Weather protection"}],"products":[{"title":"Aero X8 industrial platform","price":"$8,490","image":"https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=1400&q=85","description":"A modular multirotor platform built for inspection, mapping, and rapid deployment."},{"title":"Aero M4 field scout","price":"$3,980","image":"https://images.unsplash.com/photo-1524143986875-3b098d78b363?auto=format&fit=crop&w=1400&q=85","description":"A compact aircraft for responsive reconnaissance and close-range site assessment."},{"title":"Aero V2 fixed wing","price":"$12,600","image":"https://flipandsteep.in/assets/images/course-fixed-wing-fly.png","description":"Long-range endurance with efficient cruise and straightforward field recovery."}],"solutions":[{"title":"Industrial inspection","description":"Capture close visual and thermal data around infrastructure while keeping crews at a safe distance.","image":"https://drone-safe-register-public.s3.eu-west-2.amazonaws.com/11731/drones-and-wind-turbins.jpg"},{"title":"Survey & mapping","description":"Cover large sites with repeatable aerial capture and dependable geospatial workflows.","image":"https://images.unsplash.com/photo-1524143986875-3b098d78b363?auto=format&fit=crop&w=1600&q=85"},{"title":"Emergency response","description":"Give teams a clear aerial view when access is difficult and decisions cannot wait.","image":"https://images.unsplash.com/photo-1473968512647-3e447244af8f?auto=format&fit=crop&w=1600&q=85"}],"faq":[{"question":"Can the aircraft carry custom payloads?","answer":"Platforms are designed around modular payload integration. Share your sensor, mount, and mission requirements for a compatibility review."},{"question":"What support is available after delivery?","answer":"Configuration guidance, operator onboarding, maintenance planning, and replacement parts can be arranged with your project."},{"question":"Can you support a specialized mission profile?","answer":"Yes. Provide the operating environment, range, endurance, and payload goals so the team can recommend a suitable configuration."}]}};
const content = { kind: 'preset-page', view: 'collection', preset: { id: 'aeroframe', version: '1.0.1', name: manifest.name, description: manifest.description, ...presentation }, sections: ['grid', 'heading'], seo: { title: 'Private catalog', description: '' }, items: [] };
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
  for (const [id, version] of [['aeroframe', '9.9.9'], ['another-template', '1.0.1']]) {
    const value = structuredClone(snapshot);
    value.pages[0].content.preset.id = id;
    value.pages[0].content.preset.version = version;
    assert.equal(published.previewPage(value, '/catalog'), null);
  }
});
