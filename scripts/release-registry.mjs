import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { appendRegistryRecord } from './publish.mjs';
import { canonicalChecksum } from './validate.mjs';
import { assertManifestVersion, resolveReleaseVersion } from './release-version.mjs';

const version = resolveReleaseVersion({ templateVersion: process.env.TEMPLATE_VERSION, refName: process.env.GITHUB_REF_NAME });
const sourceCommit = process.env.SOURCE_COMMIT;
const imageDigest = process.env.IMAGE_DIGEST;
const manifestPath = `templates/aeroframe/${version}/template.json`;
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const manifestChecksum = `sha256:${canonicalChecksum(manifest)}`;
assertManifestVersion(manifest, version);
if (!/^[0-9a-f]{40}$/.test(sourceCommit || '') || !/^sha256:[0-9a-f]{64}$/.test(imageDigest || '')) {
  throw new Error('Tag, manifest, source commit, or image digest mismatch');
}
execFileSync('git', ['-C', 'registry', 'fetch', 'origin', 'registry']);
execFileSync('git', ['-C', 'registry', 'checkout', 'registry']);
const indexPath = 'registry/registry/index.json';
const index = JSON.parse(await readFile(indexPath, 'utf8'));
const record = { schemaVersion: 1, id: 'aeroframe', version, manifestChecksum,
  imageRepository: 'ghcr.io/tangtianshuo/independent-website-templates/aeroframe', imageDigest,
  sourceCommit, manifestPath, status: 'available' };
const next = appendRegistryRecord(index, record);
if (next === index) process.exit(0);
await writeFile(indexPath, `${JSON.stringify(next, null, 2)}\n`);
execFileSync('git', ['-C', 'registry', 'add', 'registry/index.json']);
execFileSync('git', ['-C', 'registry', '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', `Publish aeroframe ${version}`]);
execFileSync('git', ['-C', 'registry', 'push', 'origin', 'registry']);
