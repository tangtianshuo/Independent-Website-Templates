import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRegistryRecord } from './publish.mjs';
import { canonicalChecksum } from './validate.mjs';
import { assertManifestVersion, resolveReleaseVersion } from './release-version.mjs';
import { appendPreviewRecord } from './preview-registry.mjs';
import { refreshRegistry, publishRegistry, previewReleaseFromEnvironment } from './preview-release-registry.mjs';

export async function releaseRegistryFromEnvironment() {
  const env = process.env;
  const version = resolveReleaseVersion({ templateVersion: env.TEMPLATE_VERSION, refName: env.GITHUB_REF_NAME });
  const templateId = env.TEMPLATE_ID || 'aeroframe';
  assertManifestVersion({ id: templateId, version }, version, templateId);
  const manifestPath = `templates/${templateId}/${version}/template.json`;
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assertManifestVersion(manifest, version, templateId);
  const record = { schemaVersion: 1, id: templateId, version, manifestChecksum: `sha256:${canonicalChecksum(manifest)}`,
    imageRepository: `ghcr.io/tangtianshuo/independent-website-templates/${templateId}`, imageDigest: env.IMAGE_DIGEST,
    sourceCommit: env.SOURCE_COMMIT, manifestPath, status: 'available' };
  const preview = await previewReleaseFromEnvironment();
  const root = resolve(env.REGISTRY_ROOT || 'registry');
  const revision = refreshRegistry(root);
  const indexPath = resolve(root, 'registry/index.json'), previewPath = resolve(root, 'preview/index.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  let previewIndex = { schemaVersion: 1, records: [] };
  try { previewIndex = JSON.parse(await readFile(previewPath, 'utf8')); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
  // Validate both immutable identities before either file is changed. The remote
  // reader observes both indexes together in the single Git commit/push.
  const next = appendRegistryRecord(index, record), nextPreview = appendPreviewRecord(previewIndex, preview);
  if (next === index && nextPreview === previewIndex) return 'unchanged';
  await mkdir(resolve(root, 'preview'), { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(next, null, 2)}\n`);
  await writeFile(previewPath, `${JSON.stringify(nextPreview, null, 2)}\n`);
  publishRegistry(root, revision, ['registry/index.json', 'preview/index.json'], `Publish ${templateId} ${version}`);
  return 'written';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await releaseRegistryFromEnvironment();
