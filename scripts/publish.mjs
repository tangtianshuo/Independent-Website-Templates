import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { canonicalChecksum, validateManifest } from './validate.mjs';

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const clone = (value) => structuredClone(value);

function freezeJson(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

export function createMemoryStore(policy) {
  let index = { revision: 0, records: [] };
  const artifacts = new Map();
  return {
    policy,
    async getIndex() { return clone(index); },
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
      if (index.revision !== expectedRevision || next.revision !== expectedRevision + 1) throw new Error('Stale index revision');
      index = clone(next);
    },
  };
}

export async function publishTemplate({ manifest, root, imageDigest, signature, expectedRevision }, store) {
  if (!store?.policy || typeof store.policy.trustedIdentity !== 'string' || !store.policy.trustedIdentity ||
      typeof store.policy.verifySignature !== 'function') throw new Error('Trusted signature policy required');
  const input = clone(manifest);
  const snapshot = JSON.parse(JSON.stringify(input));
  if (!isDeepStrictEqual(input, snapshot)) throw new Error('Manifest must contain only JSON values');
  freezeJson(snapshot);
  await validateManifest(snapshot, root);
  if (!digestPattern.test(imageDigest)) throw new Error('Invalid image digest');
  if (!signature || signature.identity !== store.policy.trustedIdentity || typeof signature.value !== 'string' || !signature.value ||
      await store.policy.verifySignature({ signature, manifest: snapshot, imageDigest }) !== true) {
    throw new Error('Unapproved image signature');
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid expected revision');
  const manifestChecksum = canonicalChecksum(snapshot);
  const record = { schemaVersion: 1, id: snapshot.id, version: snapshot.version,
    manifestChecksum, imageDigest, status: 'available' };
  const index = clone(await store.getIndex());
  if (index.revision !== expectedRevision) throw new Error('Stale index revision');
  const path = `templates/${record.id}/${record.version}/${manifestChecksum}/template.json`;
  const bytes = Buffer.from(JSON.stringify(snapshot), 'utf8');
  const previous = index.records.find((entry) => entry.id === record.id && entry.version === record.version);
  if (previous) {
    if (Object.keys(record).some((key) => previous[key] !== record[key]) ||
        Object.keys(previous).length !== Object.keys(record).length ||
        !Buffer.from(await store.readArtifact(path)).equals(bytes)) {
      throw new Error('Published version conflict');
    }
    if (!isDeepStrictEqual(await store.getIndex(), index)) throw new Error('Stale index revision');
    return record;
  }
  await store.putImmutableArtifact(path, bytes);
  const readBack = Buffer.from(await store.readArtifact(path));
  if (!readBack.equals(bytes) || createHash('sha256').update(readBack).digest('hex') !== createHash('sha256').update(bytes).digest('hex') ||
      canonicalChecksum(JSON.parse(readBack.toString('utf8'))) !== manifestChecksum) {
    throw new Error('Artifact read-back bytes or checksum mismatch');
  }
  await store.compareAndSwapIndex(expectedRevision, { revision: expectedRevision + 1, records: [...index.records, record] });
  return record;
}
