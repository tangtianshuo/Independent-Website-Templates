import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gzipSync, gunzipSync } from 'node:zlib';
import { buildPreviewBundle } from '../scripts/preview-bundle.mjs';
import { canonicalChecksum } from '../scripts/validate.mjs';
import { resolvePublishedDigest } from '../scripts/publish.mjs';
import { releaseRegistryFromEnvironment } from '../scripts/release-registry.mjs';
import { appendPreviewRelease, publishRegistry, refreshRegistry } from '../scripts/preview-release-registry.mjs';
let preparePreviewRelease, verifyPreviewArchive;
try { ({ preparePreviewRelease, verifyPreviewArchive } = await import('../scripts/preview-publication.mjs')); } catch {}

const sha = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const sourceCommit = 'a'.repeat(40), imageDigest = `sha256:${'1'.repeat(64)}`;
const manifest = JSON.parse(await readFile(new URL('../templates/aeroframe/1.0.4/template.json', import.meta.url), 'utf8'));
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function fixture(t) {
  assert.equal(typeof preparePreviewRelease, 'function');
  const root = await mkdtemp(join(tmpdir(), 'preview-publication-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = join(root, 'remote.git'), registryRoot = join(root, 'registry'), store = join(root, 'oci');
  execFileSync('git', ['init', '--bare', '--initial-branch=registry', remote], { stdio: 'ignore' });
  execFileSync('git', ['clone', remote, registryRoot], { stdio: 'ignore' });
  await mkdir(join(registryRoot, 'registry'));
  await writeFile(join(registryRoot, 'registry/index.json'), JSON.stringify({ schemaVersion: 1, records: [] }));
  git(registryRoot, 'add', '.');
  git(registryRoot, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'Seed registry');
  git(registryRoot, 'push', 'origin', 'HEAD:registry');
  await mkdir(join(store, 'blobs/sha256'), { recursive: true });
  await writeFile(join(store, 'oci-layout'), '{"imageLayoutVersion":"1.0.0"}');
  const stats = { build: 0, push: 0, pull: 0, downstream: 0 };
  async function blob(bytes) {
    const digest = sha(bytes);
    await writeFile(join(store, 'blobs/sha256', digest.slice(7)), bytes);
    return { digest, size: bytes.length };
  }
  const archivePath = join(root, 'preview-bundle.tar.gz');
  const options = {
    registryRoot, manifest, sourceCommit, archivePath,
    async build() {
      stats.build++;
      const publicDir = join(root, `public-${stats.build}`), outputDir = join(root, `bundle-${stats.build}`);
      await mkdir(publicDir);
      await writeFile(join(publicDir, 'index.html'), `<base href="/preview/aeroframe/1.0.4/">build-${stats.build}`);
      const bundle = await buildPreviewBundle({ publicDir, outputDir, templateId: manifest.id, templateVersion: manifest.version, sourceCommit, manifestChecksum: `sha256:${canonicalChecksum(manifest)}` });
      execFileSync('tar', ['--format=ustar', '-czf', archivePath, '-C', outputDir, '.']);
      return bundle.bundleDigest;
    },
    async push() {
      stats.push++;
      const layer = { ...await blob(await readFile(archivePath)), mediaType: 'application/octet-stream', annotations: { 'org.opencontainers.image.title': 'preview-bundle.tar.gz' } };
      const config = { ...await blob(Buffer.from('{}')), mediaType: 'application/vnd.oci.empty.v1+json' };
      const descriptor = { ...await blob(Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', artifactType: 'application/vnd.bcms.preview.bundle.v1', config, layers: [layer], annotations: { 'org.opencontainers.image.revision': sourceCommit } }))), mediaType: 'application/vnd.oci.image.manifest.v1+json' };
      await writeFile(join(store, 'index.json'), JSON.stringify({ schemaVersion: 2, manifests: [descriptor] }));
      return descriptor.digest;
    },
    async pull(record) {
      stats.pull++;
      const bytes = await readFile(join(store, 'blobs/sha256', record.artifactDigest.slice(7)));
      assert.equal(sha(bytes), record.artifactDigest, 'stored OCI manifest must match its exact digest');
      const descriptor = JSON.parse(bytes).layers[0];
      const archive = await readFile(join(store, 'blobs/sha256', descriptor.digest.slice(7)));
      assert.equal(sha(archive), descriptor.digest, 'stored OCI layer must match its digest');
      await writeFile(archivePath, archive);
    },
  };
  async function combined({ failAfterAppend = false } = {}) {
    refreshRegistry(registryRoot);
    const index = JSON.parse(await readFile(join(registryRoot, 'registry/index.json'), 'utf8'));
    const selectedImage = resolvePublishedDigest(index, manifest, sourceCommit) || imageDigest;
    const record = await preparePreviewRelease(options);
    const saved = { ...process.env };
    try {
      Object.assign(process.env, { TEMPLATE_ID: manifest.id, TEMPLATE_VERSION: manifest.version, SOURCE_COMMIT: sourceCommit, IMAGE_DIGEST: selectedImage, PREVIEW_BUNDLE_DIGEST: record.bundleDigest, PREVIEW_ARTIFACT_DIGEST: record.artifactDigest, PREVIEW_ADAPTER_VERSION: record.adapterVersion, REGISTRY_ROOT: registryRoot, GITHUB_REF_NAME: 'master' });
      await releaseRegistryFromEnvironment();
    } finally {
      for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
      Object.assign(process.env, saved);
    }
    if (failAfterAppend) throw new Error('Injected downstream deployment failure');
    stats.downstream++;
    return record;
  }
  return { root, remote, registryRoot, store, stats, options, combined };
}

test('combined retry after a committed registry pair verifies and reuses exact OCI bytes then reaches downstream deployment', async t => {
  const f = await fixture(t);
  await assert.rejects(f.combined({ failAfterAppend: true }), /Injected downstream/);
  const approved = JSON.parse(git(f.remote, 'show', 'registry:preview/index.json')).records[0];
  const image = JSON.parse(git(f.remote, 'show', 'registry:registry/index.json')).records[0];
  assert.equal(image.imageDigest, imageDigest);
  assert.equal(image.sourceCommit, approved.sourceCommit);
  assert.equal(image.manifestChecksum, approved.manifestChecksum);
  const revision = git(f.remote, 'rev-parse', 'registry');
  const bytes = await readFile(f.options.archivePath);
  await rm(f.options.archivePath);
  const retry = await f.combined();
  assert.deepEqual(retry, approved);
  assert.deepEqual(await readFile(f.options.archivePath), bytes);
  assert.equal(git(f.remote, 'rev-parse', 'registry'), revision);
  assert.deepEqual(f.stats, { build: 1, push: 1, pull: 1, downstream: 1 });
});

test('standalone completed publication rerun reuses approved artifact and leaves Git identity unchanged', async t => {
  const f = await fixture(t);
  await f.combined();
  const revision = refreshRegistry(f.registryRoot);
  const record = await preparePreviewRelease({ ...f.options, requireReleasedImage: true });
  assert.equal(await appendPreviewRelease({ registryRoot: f.registryRoot, record }), 'unchanged');
  assert.equal(git(f.remote, 'rev-parse', 'registry'), revision);
  assert.deepEqual(f.stats, { build: 1, push: 1, pull: 1, downstream: 1 });
});

test('a previously registered image with no preview can finish the initial preview publication', async t => {
  const f = await fixture(t);
  const revision = refreshRegistry(f.registryRoot);
  const image = { schemaVersion: 1, id: manifest.id, version: manifest.version, manifestChecksum: `sha256:${canonicalChecksum(manifest)}`, sourceCommit, imageRepository: 'ghcr.io/tangtianshuo/independent-website-templates/aeroframe', imageDigest, manifestPath: 'templates/aeroframe/1.0.4/template.json', status: 'available' };
  await writeFile(join(f.registryRoot, 'registry/index.json'), JSON.stringify({ schemaVersion: 1, records: [image] }));
  publishRegistry(f.registryRoot, revision, ['registry/index.json'], 'Publish image first');
  await f.combined();
  assert.deepEqual(f.stats, { build: 1, push: 1, pull: 0, downstream: 1 });
  assert.equal(JSON.parse(git(f.remote, 'show', 'registry:registry/index.json')).records[0].imageDigest, imageDigest);
});

test('changed source or manifest checksum fails before rebuilding or pulling', async t => {
  const f = await fixture(t);
  await f.combined();
  for (const overrides of [{ sourceCommit: 'b'.repeat(40) }, { manifest: { ...manifest, name: 'Changed manifest' } }]) {
    await assert.rejects(preparePreviewRelease({ ...f.options, ...overrides }), /conflict/i);
  }
  assert.deepEqual(f.stats, { build: 1, push: 1, pull: 0, downstream: 1 });
});

test('missing OCI manifest, corrupt OCI layer, and valid OCI containing corrupt bundle all fail closed without rebuild', async t => {
  const f = await fixture(t);
  const record = await f.combined();
  const path = join(f.store, 'blobs/sha256', record.artifactDigest.slice(7));
  const bytes = await readFile(path), descriptor = JSON.parse(bytes).layers[0];
  await rm(path);
  await assert.rejects(preparePreviewRelease(f.options), /ENOENT/);
  await writeFile(path, bytes);
  const layerPath = join(f.store, 'blobs/sha256', descriptor.digest.slice(7));
  const archive = await readFile(layerPath);
  await writeFile(layerPath, 'corrupt');
  await assert.rejects(preparePreviewRelease(f.options), /OCI layer/);
  await writeFile(layerPath, archive);
  // Even a transport that delivers a well-formed archive must prove its bundle
  // identity and every file, rather than trusting a successful OCI pull alone.
  const corruptDir = join(f.root, 'bundle-1');
  await writeFile(join(corruptDir, 'index.html'), 'tampered published bytes');
  execFileSync('tar', ['--format=ustar', '-czf', f.options.archivePath, '-C', corruptDir, '.']);
  const tampered = await readFile(f.options.archivePath);
  await assert.rejects(preparePreviewRelease({ ...f.options, pull: async () => writeFile(f.options.archivePath, tampered) }), /checksum/i);
  assert.equal(f.stats.build, 1);
  assert.equal(f.stats.push, 1);
  assert.equal(f.stats.downstream, 1);
});

test('incomplete approved artifact reference and standalone missing image fail before fresh publication', async t => {
  const f = await fixture(t);
  await assert.rejects(preparePreviewRelease({ ...f.options, requireReleasedImage: true }), /released image/i);
  await f.combined();
  const indexPath = join(f.registryRoot, 'preview/index.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  delete index.records[0].artifactDigest;
  await writeFile(indexPath, JSON.stringify(index));
  await assert.rejects(preparePreviewRelease(f.options), /invalid preview/i);
  assert.deepEqual(f.stats, { build: 1, push: 1, pull: 0, downstream: 1 });
});

test('verified archives reject substituted provenance, undeclared files, links, traversal and trailing data', async t => {
  const f = await fixture(t);
  const record = await preparePreviewRelease(f.options);
  const archive = await readFile(f.options.archivePath), directory = join(f.root, 'bundle-1');
  const bundlePath = join(directory, 'preview-bundle.json'), bundleBytes = await readFile(bundlePath);
  const pack = () => execFileSync('tar', ['--format=ustar', '-czf', f.options.archivePath, '-C', directory, '.']);
  for (const change of [{ sourceCommit: 'b'.repeat(40) }, { manifestChecksum: `sha256:${'c'.repeat(64)}` }, { templateVersion: '7.0.0' }]) {
    await writeFile(bundlePath, JSON.stringify({ ...JSON.parse(bundleBytes), ...change })); pack();
    await assert.rejects(verifyPreviewArchive(f.options.archivePath, record), /identity/i);
  }
  await writeFile(bundlePath, bundleBytes);
  await writeFile(join(directory, 'extra.txt'), 'undeclared'); pack();
  await assert.rejects(verifyPreviewArchive(f.options.archivePath, record), /inventory/i);
  await rm(join(directory, 'extra.txt'));
  await symlink('index.html', join(directory, 'link.html')); pack();
  await assert.rejects(verifyPreviewArchive(f.options.archivePath, record), /links/i);
  const tar = gunzipSync(archive);
  // Header zero is the root directory; replace the next header's name, keeping
  // a valid tar checksum so rejection specifically exercises path validation.
  const unsafe = Buffer.from(tar), header = unsafe.subarray(512, 1024);
  header.fill(0, 0, 100); header.write('../escape'); header.fill(32, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  await writeFile(f.options.archivePath, gzipSync(unsafe));
  await assert.rejects(verifyPreviewArchive(f.options.archivePath, record), /unsafe/i);
  await writeFile(f.options.archivePath, gzipSync(Buffer.concat([tar, Buffer.from('unexpected')])));
  await assert.rejects(verifyPreviewArchive(f.options.archivePath, record), /trailing/i);
});
