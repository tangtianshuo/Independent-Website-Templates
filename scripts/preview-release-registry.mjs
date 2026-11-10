import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { canonicalChecksum } from './validate.mjs';
import { appendPreviewRecord } from './preview-registry.mjs';

const id = process.env.TEMPLATE_ID;
const version = process.env.TEMPLATE_VERSION;
const sourceCommit = process.env.SOURCE_COMMIT;
const bundleDigest = process.env.PREVIEW_BUNDLE_DIGEST;
const artifactDigest = process.env.PREVIEW_ARTIFACT_DIGEST;
if (!id || !version || !/^[a-f0-9]{40}$/.test(sourceCommit || '') ||
    !/^sha256:[a-f0-9]{64}$/.test(bundleDigest || '') ||
    !/^sha256:[a-f0-9]{64}$/.test(artifactDigest || '')) {
  throw new Error('Missing preview release identity');
}
const manifestPath = `templates/${id}/${version}/template.json`;
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.id !== id || manifest.version !== version) throw new Error('Preview release identity mismatch');
const indexPath = 'registry/preview/index.json';
let index = { schemaVersion: 1, records: [] };
try { index = JSON.parse(await readFile(indexPath, 'utf8')); }
catch (cause) { if (cause?.code !== 'ENOENT') throw cause; }
const record = {
  id,
  version,
  manifestChecksum: `sha256:${canonicalChecksum(manifest)}`,
  sourceCommit,
  bundleDigest,
  artifactDigest,
  bundlePath: `templates/${id}/${version}`,
  adapterVersion: process.env.PREVIEW_ADAPTER_VERSION || '1',
  protocolVersion: 1,
  status: 'available',
};
const next = appendPreviewRecord(index, record);
if (next === index) process.exit(0);
await mkdir('registry/preview', { recursive: true });
await writeFile(indexPath, `${JSON.stringify(next, null, 2)}\n`);
execFileSync('git', ['-C', 'registry', 'add', 'registry/preview/index.json']);
execFileSync('git', ['-C', 'registry', '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', `Publish preview ${id} ${version}`]);
execFileSync('git', ['-C', 'registry', 'push', 'origin', 'registry']);
