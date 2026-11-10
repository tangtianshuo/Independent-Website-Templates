import { readFile, rename, writeFile } from 'node:fs/promises';

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const recordKeys = [
    'id', 'version', 'manifestChecksum', 'sourceCommit', 'bundleDigest',
    'artifactDigest', 'bundlePath', 'adapterVersion', 'protocolVersion', 'status',
];

export function validPreviewRecord(record) {
    return record && recordKeys.every(key => Object.hasOwn(record, key)) && Object.keys(record).length === recordKeys.length &&
        idPattern.test(record.id) && versionPattern.test(record.version) &&
        digestPattern.test(record.manifestChecksum) && commitPattern.test(record.sourceCommit) &&
        digestPattern.test(record.bundleDigest) && digestPattern.test(record.artifactDigest) &&
        record.bundlePath === `templates/${record.id}/${record.version}` &&
        typeof record.adapterVersion === 'string' && /^[1-9]\d*$/.test(record.adapterVersion) &&
        record.protocolVersion === 1 && record.status === 'available';
}

export function appendPreviewRecord(registry, incoming) {
    if (!registry || registry.schemaVersion !== 1 || !Array.isArray(registry.records) ||
        !validPreviewRecord(incoming)) throw new Error('Invalid preview registry record');
    const existing = registry.records.find(record => record.id === incoming.id && record.version === incoming.version);
    if (existing) {
        if (JSON.stringify(existing) !== JSON.stringify(incoming)) throw new Error('Published preview version conflict');
        return registry;
    }
    return { schemaVersion: 1, records: [...registry.records, incoming] };
}

export async function appendPreviewRegistryFile({ path, record }) {
    const registry = JSON.parse(await readFile(path, 'utf8'));
    const next = appendPreviewRecord(registry, record);
    if (next === registry) return { record, changed: false };
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`);
    await rename(temporary, path);
    return { record, changed: true };
}

if (process.argv[1]?.endsWith('preview-registry.mjs')) {
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
