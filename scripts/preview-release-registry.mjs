import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalChecksum } from './validate.mjs';
import { appendPreviewRecord } from './preview-registry.mjs';

// A checkout-local lock serializes callers. Crashed publishers fail closed; CI starts
// from a fresh checkout and both workflows additionally share one concurrency group.
export async function withRegistryLock(registryRoot, operation) {
  await mkdir(registryRoot, { recursive: true });
  const lock = join(registryRoot, '.preview-publication.lock');
  const deadline = Date.now() + 5000;
  while (true) {
    try { await mkdir(lock); break; }
    catch (cause) {
      if (cause.code !== 'EEXIST') throw cause;
      if (Date.now() >= deadline) throw new Error('Registry is locked; inspect interrupted publication before retry');
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  try { return await operation(); } finally { await rm(lock, { recursive: true, force: true }); }
}

export async function appendPreviewRelease({ registryRoot, record }) {
  const root = resolve(registryRoot);
  return withRegistryLock(root, async () => {
    const path = join(root, 'preview', 'index.json');
    let index = { schemaVersion: 1, records: [] };
    try { index = JSON.parse(await readFile(path, 'utf8')); }
    catch (cause) { if (cause.code !== 'ENOENT') throw cause; }
    const next = appendPreviewRecord(index, record);
    if (next === index) return 'unchanged';
    await mkdir(join(root, 'preview'), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' });
      await rename(temporary, path);
    } finally { await rm(temporary, { force: true }); }
    return 'written';
  });
}

export function refreshRegistry(registryRoot) {
  const git = args => execFileSync('git', ['-C', registryRoot, ...args], { encoding: 'utf8' }).trim();
  if (git(['status', '--porcelain'])) throw new Error('Registry checkout is not clean');
  git(['fetch', 'origin', 'registry']);
  git(['merge', '--ff-only', 'origin/registry']);
  return git(['rev-parse', 'HEAD']);
}
export function publishRegistry(registryRoot, revision, paths, message) {
  const git = args => execFileSync('git', ['-C', registryRoot, ...args], { encoding: 'utf8' }).trim();
  git(['fetch', 'origin', 'registry']);
  if (git(['rev-parse', 'HEAD']) !== revision || git(['rev-parse', 'origin/registry']) !== revision) throw new Error('Stale registry revision');
  git(['add', '--', ...paths]);
  git(['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', message]);
  git(['push', 'origin', 'HEAD:registry']); // Normal fast-forward push is the remote CAS.
}

export async function previewReleaseFromEnvironment() {
  const env = process.env;
  const id = env.TEMPLATE_ID, version = env.TEMPLATE_VERSION;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id || '') || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version || '')) throw new Error('Invalid release target');
  const manifest = JSON.parse(await readFile(`templates/${id}/${version}/template.json`, 'utf8'));
  if (manifest.id !== id || manifest.version !== version) throw new Error('Preview release identity mismatch');
  const record = { id, version, manifestChecksum: `sha256:${canonicalChecksum(manifest)}`, sourceCommit: env.SOURCE_COMMIT,
    bundleDigest: env.PREVIEW_BUNDLE_DIGEST, artifactDigest: env.PREVIEW_ARTIFACT_DIGEST, bundlePath: `templates/${id}/${version}`,
    adapterVersion: env.PREVIEW_ADAPTER_VERSION || '1', protocolVersion: 1, status: 'available' };
  return record;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const registryRoot = resolve(process.env.REGISTRY_ROOT || 'registry');
  const record = await previewReleaseFromEnvironment();
  const revision = refreshRegistry(registryRoot);
  const imageIndex = JSON.parse(await readFile(join(registryRoot, 'registry/index.json'), 'utf8'));
  const image = imageIndex.records?.find(entry => entry.id === record.id && entry.version === record.version);
  if (!image || image.sourceCommit !== record.sourceCommit || image.manifestChecksum !== record.manifestChecksum) throw new Error('Preview source does not match the released image');
  if (await appendPreviewRelease({ registryRoot, record }) === 'written') publishRegistry(registryRoot, revision, ['preview/index.json'], `Publish preview ${record.id} ${record.version}`);
}
