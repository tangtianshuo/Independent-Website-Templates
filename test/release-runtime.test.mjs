import assert from 'node:assert/strict';
import test from 'node:test';
let runtimeGateFor;
try { ({ runtimeGateFor } = await import('../scripts/release-runtime.mjs')); } catch {}

test('runtime gate follows renderer contract rather than template name or version', () => {
  assert.equal(typeof runtimeGateFor, 'function');
  const manifest = { id: 'future-template', version: '7.2.1' };
  assert.equal(runtimeGateFor(manifest), 'legacy');
  assert.equal(runtimeGateFor({ ...manifest, renderer: { contractVersion: 1, templateId: manifest.id, templateVersion: manifest.version } }), 'artifact');
});

test('runtime gate rejects unsupported or mismatched renderer declarations', () => {
  assert.equal(typeof runtimeGateFor, 'function');
  const manifest = { id: 'future-template', version: '7.2.1' };
  for (const renderer of [null, {}, { contractVersion: 2 }, { contractVersion: 1, templateId: 'other', templateVersion: manifest.version }]) {
    assert.throws(() => runtimeGateFor({ ...manifest, renderer }), /renderer/i);
  }
});
