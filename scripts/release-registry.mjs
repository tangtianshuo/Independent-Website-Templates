import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { appendRegistryRecord } from './publish.mjs';
import { appendPreviewRecord } from './preview-registry.mjs';
import { canonicalChecksum } from './validate.mjs';
import { assertManifestVersion, resolveReleaseVersion } from './release-version.mjs';

const version = resolveReleaseVersion({ templateVersion: process.env.TEMPLATE_VERSION, refName: process.env.GITHUB_REF_NAME });
const sourceCommit = process.env.SOURCE_COMMIT;
const imageDigest = process.env.IMAGE_DIGEST;
const templateId = process.env.TEMPLATE_ID || 'aeroframe';
assertManifestVersion({ id: templateId, version }, version, templateId);
const manifestPath = `templates/${templateId}/${version}/template.json`;
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const manifestChecksum = `sha256:${canonicalChecksum(manifest)}`;
assertManifestVersion(manifest, version, templateId);
if (!/^[0-9a-f]{40}$/.test(sourceCommit || '') || !/^sha256:[0-9a-f]{64}$/.test(imageDigest || '')) {
  throw new Error('Tag, manifest, source commit, or image digest mismatch');
}
execFileSync('git', ['-C', 'registry', 'fetch', 'origin', 'registry']);
execFileSync('git', ['-C', 'registry', 'checkout', 'registry']);
const indexPath = 'registry/registry/index.json';
const index = JSON.parse(await readFile(indexPath, 'utf8'));
const record = { schemaVersion: 1, id: templateId, version, manifestChecksum,
  imageRepository: `ghcr.io/tangtianshuo/independent-website-templates/${templateId}`, imageDigest,
  sourceCommit, manifestPath, status: 'available' };
const next = appendRegistryRecord(index, record);
const previewDigest = process.env.PREVIEW_BUNDLE_DIGEST;
if (!/^sha256:[0-9a-f]{64}$/.test(previewDigest || '')) throw new Error('Missing preview bundle digest');
const previewArtifactDigest = process.env.PREVIEW_ARTIFACT_DIGEST;
if (!/^sha256:[0-9a-f]{64}$/.test(previewArtifactDigest || '')) throw new Error('Missing preview artifact digest');
const previewRecord = {
  id: templateId,
  version,
  manifestChecksum,
  sourceCommit,
  bundleDigest: previewDigest,
  artifactDigest: previewArtifactDigest,
  bundlePath: `templates/${templateId}/${version}`,
  adapterVersion: process.env.PREVIEW_ADAPTER_VERSION || '1',
  protocolVersion: 1,
  status: 'available',
};
const previewIndexPath = 'registry/preview/index.json';
let previewIndex = { schemaVersion: 1, records: [] };
try { previewIndex = JSON.parse(await readFile(previewIndexPath, 'utf8')); }
catch (cause) {
  if (cause?.code !== 'ENOENT') throw cause;
}
const nextPreview = appendPreviewRecord(previewIndex, previewRecord);
if (next === index && nextPreview === previewIndex) process.exit(0);
await mkdir('registry/preview', { recursive: true });
await writeFile(indexPath, `${JSON.stringify(next, null, 2)}\n`);
await writeFile(previewIndexPath, `${JSON.stringify(nextPreview, null, 2)}\n`);
execFileSync('git', ['-C', 'registry', 'add', 'registry/index.json', 'registry/preview/index.json']);
execFileSync('git', ['-C', 'registry', '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', `Publish ${templateId} ${version}`]);
execFileSync('git', ['-C', 'registry', 'push', 'origin', 'registry']);
