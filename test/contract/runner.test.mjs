import assert from 'node:assert/strict';
import test from 'node:test';
import { runContract } from '../../contracts/runner.mjs';
import { validatePublishedAssets } from '../../contracts/assets.mjs';
import { contractFixture } from '../contract-fixture.mjs';

const templateRoot = new URL('../../templates/aeroframe/1.0.4/', import.meta.url).pathname;

test('contract runner validates and renders every page in a snapshot', async () => {
  const snapshot = contractFixture();
  const result = await runContract({ snapshot, templateRoot });
  assert.deepEqual(result.pages, ['/']);
  assert.equal(result.manifest.renderer.templateId, 'aeroframe');
});

test('contract runner rejects a renderer identity mismatch before rendering', async () => {
  const snapshot = contractFixture();
  snapshot.template.version = '1.0.2';
  await assert.rejects(runContract({ snapshot, templateRoot }), /identity mismatch/i);
});

test('contract runner rejects assets outside the published manifest', async () => {
  const snapshot = contractFixture();
  snapshot.assets = [{ path: 'assets/unknown.webp', checksum: `sha256:${'0'.repeat(64)}`, mimeType: 'image/webp', url: '/_assets/assets/unknown.webp' }];
  await assert.rejects(runContract({ snapshot, templateRoot }), /unauthorized asset/i);
});

test('contract runner rejects unsupported section names through the real renderer', async () => {
  const snapshot = contractFixture();
  snapshot.pages[0].content.sections = ['unknown'];
  await assert.rejects(runContract({ snapshot, templateRoot }), /renderer rejected/i);
});

test('runtime asset validation accepts contract assets without a duplicated manifest asset list', () => {
  assert.equal(validatePublishedAssets([
    { path: 'assets/hero.png', checksum: `sha256:${'0'.repeat(64)}`, mimeType: 'image/png' },
  ], undefined, '/_assets/'), true);
});
