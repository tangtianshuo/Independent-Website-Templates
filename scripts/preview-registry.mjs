import { isDeepStrictEqual } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const recordKeys = [
    'id', 'version', 'manifestChecksum', 'sourceCommit', 'bundleDigest',
    'artifactDigest', 'bundlePath', 'adapterVersion', 'protocolVersion', 'status',
];

export function validPreviewRecord(record) {
    return record && !Array.isArray(record) && ['id','version','manifestChecksum','sourceCommit','bundleDigest','artifactDigest','bundlePath','adapterVersion','status'].every(key => typeof record[key] === 'string') && recordKeys.every(key => Object.hasOwn(record, key)) && Object.keys(record).length === recordKeys.length &&
        idPattern.test(record.id) && versionPattern.test(record.version) &&
        digestPattern.test(record.manifestChecksum) && commitPattern.test(record.sourceCommit) &&
        digestPattern.test(record.bundleDigest) && digestPattern.test(record.artifactDigest) &&
        record.bundlePath === `templates/${record.id}/${record.version}` &&
        typeof record.adapterVersion === 'string' && /^[1-9]\d*$/.test(record.adapterVersion) &&
        record.protocolVersion === 1 && record.status === 'available';
}

export function appendPreviewRecord(registry, incoming) {
    if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.records) ||
        Object.keys(registry).some(key => !['schemaVersion', 'records'].includes(key)) ||
        registry.records.some(record => !validPreviewRecord(record)) ||
        new Set(registry.records.map(record => `${record.id}@${record.version}`)).size !== registry.records.length || !validPreviewRecord(incoming)) throw new Error('Invalid preview registry record');
    const existing = registry.records.find(record => record.id === incoming.id && record.version === incoming.version);
    if (existing) {
        if (!isDeepStrictEqual(existing, incoming)) throw new Error('Published preview version conflict');
        return registry;
    }
    return { schemaVersion: 1, records: [...registry.records, incoming] };
}

export async function appendPreviewRegistryFile({ path, record }) {
    const registryRoot = dirname(dirname(resolve(path)));
    if (resolve(path) !== join(registryRoot, 'preview', 'index.json')) throw new Error('Preview registry must be checkout-relative preview/index.json');
    const { appendPreviewRelease } = await import('./preview-release-registry.mjs');
    return { record, changed: await appendPreviewRelease({ registryRoot, record }) === 'written' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const record = {
        id: process.env.TEMPLATE_ID,
        version: process.env.TEMPLATE_VERSION,
        manifestChecksum: process.env.MANIFEST_CHECKSUM,
        sourceCommit: process.env.SOURCE_COMMIT,
        bundleDigest: process.env.PREVIEW_BUNDLE_DIGEST,
        artifactDigest: process.env.PREVIEW_ARTIFACT_DIGEST,
        bundlePath: `templates/${process.env.TEMPLATE_ID}/${process.env.TEMPLATE_VERSION}`,
        adapterVersion: process.env.PREVIEW_ADAPTER_VERSION || '1',
        protocolVersion: 1,
        status: 'available',
    };
    const result = await appendPreviewRegistryFile({ path: process.env.PREVIEW_REGISTRY_PATH, record });
    console.log(JSON.stringify(result));
}
