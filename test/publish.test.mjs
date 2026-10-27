import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalChecksum } from '../scripts/validate.mjs';
import { appendRegistryRecord, createMemoryStore, publishTemplate, resolvePublishedDigest, validateRegistryIndex } from '../scripts/publish.mjs';

const manifest = JSON.parse(await readFile(new URL('../templates/aeroframe/1.0.0/template.json', import.meta.url)));
const checksum = canonicalChecksum(manifest);
const imageDigest = `sha256:${'a'.repeat(64)}`;
const identity = 'trusted-release-builder';
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const payload = (m, digest) => Buffer.from(JSON.stringify([m.id, m.version, canonicalChecksum(m), digest]));
const signatureFor = (m = manifest, digest = imageDigest) => ({
  identity,
  value: sign(null, payload(m, digest), privateKey).toString('base64'),
});
const root = new URL('../templates/aeroframe/1.0.0/', import.meta.url);
const options = (m = manifest, digest = imageDigest, revision = 0, assetRoot = root) => ({
  manifest: m, root: assetRoot, imageDigest: digest, signature: signatureFor(m, digest), expectedRevision: revision,
});
const store = () => createMemoryStore({
  trustedIdentity: identity,
  verifySignature: ({ signature, manifest: m, imageDigest: digest }) =>
    verify(null, payload(m, digest), publicKey, Buffer.from(signature.value, 'base64')),
});

const record = { schemaVersion: 1, id: manifest.id, version: manifest.version,
  manifestChecksum: `sha256:${checksum}`, imageRepository: 'ghcr.io/tangtianshuo/independent-website-templates/aeroframe', imageDigest,
  sourceCommit: '0'.repeat(40), manifestPath: `templates/${manifest.id}/${manifest.version}/template.json`, status: 'available' };
const path = record.manifestPath;

test('matches the CMS canonical checksum fixture', () => {
  assert.equal(canonicalChecksum({ b: 'é', a: [{ z: 1, x: 2 }, 3] }), '371f0dd6b78043fdcfcc13eae4216508162eed0b80dd243be24dfa467037510c');
});

test('validates registry records and appends immutable versions', () => {
  const empty = { schemaVersion: 1, records: [] };
  assert.deepEqual(appendRegistryRecord(empty, record), { schemaVersion: 1, records: [record] });
  assert.equal(appendRegistryRecord({ schemaVersion: 1, records: [record] }, structuredClone(record)).records.length, 1);
  assert.throws(() => appendRegistryRecord({ schemaVersion: 1, records: [record] }, { ...record, imageDigest: `sha256:${'b'.repeat(64)}` }), /conflict/i);
  assert.throws(() => validateRegistryIndex({ schemaVersion: 1, records: [{ ...record, manifestChecksum: 'bad' }] }), /invalid registry/i);
  assert.throws(() => validateRegistryIndex({ schemaVersion: 1, records: [record, record] }), /duplicate/i);
});

test('reuses only a published digest tied to this exact source commit and manifest', () => {
  assert.equal(resolvePublishedDigest({ schemaVersion: 1, records: [record] }, manifest, '0'.repeat(40)), imageDigest);
  assert.throws(() => resolvePublishedDigest({ schemaVersion: 1, records: [record] }, manifest, '1'.repeat(40)), /conflict/i);
  const changed = structuredClone(manifest); changed.name += ' changed';
  assert.throws(() => resolvePublishedDigest({ schemaVersion: 1, records: [record] }, changed, '0'.repeat(40)), /conflict/i);
});

test('publishes an approved digest with exact available record and immutable path', async () => {
  const memory = store();
  assert.deepEqual(await publishTemplate(options(), memory), record);
  assert.deepEqual(await memory.getIndex(), { schemaVersion: 1, records: [record] });
  assert.deepEqual(JSON.parse(await memory.readArtifact(path)), manifest);
});

test('rejects missing policy, untrusted identity, invalid signature and malformed digest', async () => {
  await assert.rejects(publishTemplate(options(), createMemoryStore()), /policy/i);
  for (const mutate of [
    (o) => { o.signature = null; },
    (o) => { o.signature.identity = 'attacker'; },
    (o) => { o.signature.value = signatureFor(manifest, `sha256:${'b'.repeat(64)}`).value; },
    (o) => { o.imageDigest = 'latest'; },
  ]) {
    const memory = store();
    const input = options(); mutate(input);
    await assert.rejects(publishTemplate(input, memory));
    assert.deepEqual(await memory.getIndex(), { schemaVersion: 1, records: [] });
  }
});

test('mutation while signature verification waits cannot change the published manifest', async () => {
  const candidate = structuredClone(manifest);
  const memory = store();
  const verifySignature = memory.policy.verifySignature;
  let releaseVerifier;
  let verifierStarted;
  const started = new Promise((resolve) => { verifierStarted = resolve; });
  memory.policy.verifySignature = async (input) => {
    verifierStarted();
    await new Promise((resolve) => { releaseVerifier = resolve; });
    return verifySignature(input);
  };
  const publishing = publishTemplate(options(candidate), memory);
  await started;
  candidate.name = 'Changed during verification';
  releaseVerifier();
  assert.deepEqual(await publishing, record);
  assert.deepEqual(await memory.getIndex(), { schemaVersion: 1, records: [record] });
  assert.deepEqual(JSON.parse(await memory.readArtifact(path)), manifest);
});

test('rejects manifest properties lost at the JSON boundary', async () => {
  const candidate = structuredClone(manifest);
  candidate.extra = undefined;
  const memory = store();
  await assert.rejects(publishTemplate(options(candidate), memory), /JSON|manifest/i);
  assert.deepEqual(await memory.getIndex(), { schemaVersion: 1, records: [] });
});

test('same version, checksum and digest is idempotent; changed bytes or digest conflict', async () => {
  const memory = store();
  await publishTemplate(options(), memory);
  assert.deepEqual(await publishTemplate(options(manifest, imageDigest, 1), memory), record);
  assert.equal((await memory.getIndex()).records.length, 1);
  const changed = structuredClone(manifest); changed.name = 'Changed';
  await assert.rejects(publishTemplate(options(changed, imageDigest, 1), memory), /conflict/i);
  await assert.rejects(publishTemplate(options(manifest, `sha256:${'b'.repeat(64)}`, 1), memory), /conflict/i);
  assert.deepEqual(await memory.getIndex(), { schemaVersion: 1, records: [record] });
});

test('same canonical checksum with different manifest bytes is not idempotent', async () => {
  const memory = store();
  await publishTemplate(options(), memory);
  const reordered = Object.fromEntries(Object.entries(manifest).reverse());
  assert.equal(canonicalChecksum(reordered), checksum);
  await assert.rejects(publishTemplate(options(reordered, imageDigest, 1), memory), /conflict/i);
  assert.deepEqual(await memory.getIndex(), { schemaVersion: 1, records: [record] });
});

test('rejects invalid assets before uploading or writing index', async (t) => {
  const assetRoot = await mkdtemp(join(tmpdir(), 'template-publish-'));
  t.after(() => rm(assetRoot, { recursive: true, force: true }));
  await mkdir(join(assetRoot, 'assets'));
  const source = await readFile(new URL('assets/hero.png', root));
  const cases = [
    { name: 'missing file', bytes: null, change: () => {}, error: /ENOENT|asset/i },
    { name: 'wrong checksum', bytes: source, change: (m) => { m.assets[0].checksum = '0'.repeat(64); }, error: /checksum/i },
    { name: 'wrong extension MIME', bytes: source, change: (m) => { m.assets[0].mimeType = 'image/jpeg'; }, error: /extension|MIME/i },
    { name: 'invalid image bytes', bytes: Buffer.from('not a PNG'), change: (m) => { m.assets[0].checksum = createHash('sha256').update(Buffer.from('not a PNG')).digest('hex'); }, error: /image bytes/i },
  ];
  for (const { name, bytes, change, error } of cases) {
    await rm(join(assetRoot, 'assets', 'hero.png'), { force: true });
    if (bytes) await writeFile(join(assetRoot, 'assets', 'hero.png'), bytes);
    const candidate = structuredClone(manifest);
    change(candidate);
    const memory = store();
    memory.putImmutableArtifact = async () => { assert.fail(`${name}: uploaded invalid manifest`); };
    await assert.rejects(publishTemplate(options(candidate, imageDigest, 0, assetRoot), memory), error);
    assert.deepEqual(await memory.getIndex(), { schemaVersion: 1, records: [] });
  }
});

test('idempotent publish accepts reordered fields in existing record', async () => {
  const memory = store();
  await publishTemplate(options(), memory);
  const getIndex = memory.getIndex;
  memory.getIndex = async () => {
    const index = await getIndex();
    index.records[0] = Object.fromEntries(Object.entries(index.records[0]).reverse());
    return index;
  };
  assert.deepEqual(await publishTemplate(options(manifest, imageDigest, 1), memory), record);
  assert.equal((await memory.getIndex()).records.length, 1);
});

test('idempotent publish rejects index revision changed during artifact read', async () => {
  const memory = store();
  await publishTemplate(options(), memory);
  const readArtifact = memory.readArtifact;
  const cas = memory.compareAndSwapIndex;
  memory.readArtifact = async (...args) => {
    const bytes = await readArtifact(...args);
    await cas(1, { schemaVersion: 1, records: [record] });
    return bytes;
  };
  await assert.rejects(publishTemplate(options(manifest, imageDigest, 1), memory), /stale|revision/i);
  assert.deepEqual(await memory.getIndex(), { schemaVersion: 1, records: [record] });
});

test('idempotent publish rejects index data changed without revision change', async () => {
  const memory = store();
  await publishTemplate(options(), memory);
  const getIndex = memory.getIndex;
  let reads = 0;
  memory.getIndex = async () => {
    const index = await getIndex();
    if (++reads > 1) index.records.push({ ...record, id: 'other', imageRepository: 'ghcr.io/tangtianshuo/independent-website-templates/other', manifestPath: 'templates/other/1.0.0/template.json' });
    return index;
  };
  await assert.rejects(publishTemplate(options(manifest, imageDigest, 1), memory), /stale|revision/i);
});

test('upload failure and corrupted read-back never expose an available record', async () => {
  for (const fault of ['upload', 'read']) {
    const memory = store();
    const original = memory[fault === 'upload' ? 'putImmutableArtifact' : 'readArtifact'];
    memory[fault === 'upload' ? 'putImmutableArtifact' : 'readArtifact'] = fault === 'upload'
      ? async () => { throw new Error('upload failed'); }
      : async (...args) => { await original(...args); return Buffer.from('{}'); };
    await assert.rejects(publishTemplate(options(), memory));
    assert.deepEqual(await memory.getIndex(), { schemaVersion: 1, records: [] });
  }
});

test('stale revision cannot publish or overwrite a concurrent index update', async () => {
  const memory = store();
  await publishTemplate(options(), memory);
  await assert.rejects(publishTemplate(options(), memory), /revision/i);
  assert.deepEqual(await memory.getIndex(), { schemaVersion: 1, records: [record] });
  const race = store();
  const cas = race.compareAndSwapIndex;
  race.compareAndSwapIndex = async (...args) => {
    await cas(0, { schemaVersion: 1, records: [] });
    return cas(...args);
  };
  await assert.rejects(publishTemplate(options(), race), /revision/i);
  assert.deepEqual(await race.getIndex(), { schemaVersion: 1, records: [] });
});

test('read-back JSON must exactly match source even when canonical checksum is unchanged', async () => {
  const memory = store();
  const original = memory.readArtifact;
  memory.readArtifact = async (...args) => {
    const bytes = await original(...args);
    return Buffer.from(JSON.stringify(JSON.parse(bytes), null, 2));
  };
  await assert.rejects(publishTemplate(options(), memory), /read-back|bytes/i);
  assert.deepEqual(await memory.getIndex(), { schemaVersion: 1, records: [] });
});
