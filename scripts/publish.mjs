import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { canonicalChecksum, validateManifest } from './validate.mjs';

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const checksumPattern = /^sha256:[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const sourceRepository = 'tangtianshuo/Independent-Website-Templates';
const clone = (value) => structuredClone(value);

function freezeJson(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

export function createMemoryStore(policy) {
  let revision = 0;
  let index = { schemaVersion: 1, records: [] };
  const artifacts = new Map();
  return {
    policy,
    async getIndex() { return clone(index); },
    async getRevision() { return revision; },
    async putImmutableArtifact(path, bytes) {
      const incoming = Buffer.from(bytes);
      if (artifacts.has(path) && !artifacts.get(path).equals(incoming)) throw new Error('Immutable artifact conflict');
      artifacts.set(path, incoming);
    },
    async readArtifact(path) {
      if (!artifacts.has(path)) throw new Error('Artifact not found');
      return Buffer.from(artifacts.get(path));
    },
    async compareAndSwapIndex(expectedRevision, next) {
      if (revision !== expectedRevision) throw new Error('Stale index revision');
      revision++;
      index = clone(next);
    },
  };
}

export function validateRegistryIndex(index) {
  if (!index || index.schemaVersion !== 1 || !Array.isArray(index.records) || Object.keys(index).some((key) => !['schemaVersion', 'records'].includes(key))) throw new Error('Invalid registry index');
  const seen = new Set();
  for (const record of index.records) {
    if (record.schemaVersion !== 1 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id) || !/^\d+\.\d+\.\d+$/.test(record.version) ||
      !checksumPattern.test(record.manifestChecksum) || record.imageRepository !== `ghcr.io/${sourceRepository.toLowerCase()}/${record.id}` ||
      !digestPattern.test(record.imageDigest) || !commitPattern.test(record.sourceCommit) ||
      record.manifestPath !== `templates/${record.id}/${record.version}/template.json` || record.status !== 'available' ||
      Object.keys(record).length !== 9) throw new Error('Invalid registry record');
    const key = `${record.id}@${record.version}`;
    if (seen.has(key)) throw new Error('Duplicate registry version');
    seen.add(key);
  }
  return index;
}

export function appendRegistryRecord(index, incoming) {
  validateRegistryIndex(index);
  validateRegistryIndex({ schemaVersion: 1, records: [incoming] });
  const previous = index.records.find((record) => record.id === incoming.id && record.version === incoming.version);
  if (previous) {
    if (!isDeepStrictEqual(previous, incoming)) throw new Error('Published version conflict');
    return index;
  }
  return validateRegistryIndex({ schemaVersion: 1, records: [...index.records, incoming] });
}

export function resolvePublishedDigest(index, manifest, sourceCommit) {
  validateRegistryIndex(index);
  const previous = index.records.find((entry) => entry.id === manifest.id && entry.version === manifest.version);
  if (!previous) return null;
  if (previous.sourceCommit !== sourceCommit || previous.manifestChecksum !== `sha256:${canonicalChecksum(manifest)}`) {
    throw new Error('Published version conflict');
  }
  return previous.imageDigest;
}

export async function publishTemplate({ manifest, root, imageDigest, signature, expectedRevision = 0, sourceCommit = '0'.repeat(40), imageRepository = `ghcr.io/${sourceRepository.toLowerCase()}/${manifest.id}` }, store) {
  if (!store?.policy || typeof store.policy.trustedIdentity !== 'string' || !store.policy.trustedIdentity ||
      typeof store.policy.verifySignature !== 'function') throw new Error('Trusted signature policy required');
  const input = clone(manifest);
  const snapshot = JSON.parse(JSON.stringify(input));
  if (!isDeepStrictEqual(input, snapshot)) throw new Error('Manifest must contain only JSON values');
  freezeJson(snapshot);
  await validateManifest(snapshot, root);
  if (!digestPattern.test(imageDigest)) throw new Error('Invalid image digest');
  if (!commitPattern.test(sourceCommit) || imageRepository !== `ghcr.io/${sourceRepository.toLowerCase()}/${snapshot.id}`) throw new Error('Invalid source identity or image repository');
  if (!signature || signature.identity !== store.policy.trustedIdentity || typeof signature.value !== 'string' || !signature.value ||
      await store.policy.verifySignature({ signature, manifest: snapshot, imageDigest }) !== true) {
    throw new Error('Unapproved image signature');
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid expected revision');
  const manifestChecksum = canonicalChecksum(snapshot);
  const record = { schemaVersion: 1, id: snapshot.id, version: snapshot.version,
    manifestChecksum: `sha256:${manifestChecksum}`, imageRepository, imageDigest, sourceCommit,
    manifestPath: `templates/${snapshot.id}/${snapshot.version}/template.json`, status: 'available' };
  const index = clone(await store.getIndex());
  const oldIndex = validateRegistryIndex(index);
  if (typeof store.getRevision === 'function' && await store.getRevision() !== expectedRevision) throw new Error('Stale index revision');
  const path = record.manifestPath;
  const bytes = Buffer.from(JSON.stringify(snapshot), 'utf8');
  const previous = oldIndex.records.find((entry) => entry.id === record.id && entry.version === record.version);
  if (previous) {
    if (Object.keys(record).some((key) => previous[key] !== record[key]) ||
        Object.keys(previous).length !== Object.keys(record).length ||
        !Buffer.from(await store.readArtifact(path)).equals(bytes)) {
      throw new Error('Published version conflict');
    }
    if (!isDeepStrictEqual(await store.getIndex(), index) || (typeof store.getRevision === 'function' && await store.getRevision() !== expectedRevision)) throw new Error('Stale index revision');
    return record;
  }
  await store.putImmutableArtifact(path, bytes);
  const readBack = Buffer.from(await store.readArtifact(path));
  if (!readBack.equals(bytes) || createHash('sha256').update(readBack).digest('hex') !== createHash('sha256').update(bytes).digest('hex') ||
      canonicalChecksum(JSON.parse(readBack.toString('utf8'))) !== manifestChecksum) {
    throw new Error('Artifact read-back bytes or checksum mismatch');
  }
  const next = validateRegistryIndex({ schemaVersion: 1, records: [...oldIndex.records, record] });
  await store.compareAndSwapIndex(expectedRevision, next);
  return record;
}
