import assert from 'node:assert/strict';
import test from 'node:test';
import { assertManifestVersion, resolveReleaseVersion } from '../scripts/release-version.mjs';

test('resolves version from TEMPLATE_VERSION, release branch, and legacy tag', () => {
  assert.equal(resolveReleaseVersion({ templateVersion: '2.3.4' }), '2.3.4');
  assert.equal(resolveReleaseVersion({ refName: 'release/v2.3.4' }), '2.3.4');
  assert.equal(resolveReleaseVersion({ refName: 'aeroframe-v2.3.4' }), '2.3.4');
  assert.equal(resolveReleaseVersion({ refName: 'master' }), '1.0.2');
});

test('rejects malformed refs and mismatched version overrides', () => {
  for (const refName of ['release/1.2', 'release/1.2.3', 'release/v01.2.3', 'release/v1.2.3-rc', 'aeroframe-vlatest', 'feature/foo']) {
    assert.throws(() => resolveReleaseVersion({ refName }), /release|version/i);
  }
  assert.throws(() => resolveReleaseVersion({ templateVersion: 'latest' }), /malformed/i);
  assert.throws(() => resolveReleaseVersion({ templateVersion: '1.2.3', refName: 'release/v1.2.4' }), /does not match/i);
});

test('rejects a release version that differs from the manifest', () => {
  assert.throws(() => assertManifestVersion({ id: 'aeroframe', version: '1.0.1' }, '1.0.2'), /does not match/i);
  assert.throws(() => assertManifestVersion({ id: 'other', version: '1.0.2' }, '1.0.2'), /does not match/i);
});
