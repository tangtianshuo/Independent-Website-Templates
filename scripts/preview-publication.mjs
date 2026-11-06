import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { buildPreviewBundle } from './preview-bundle.mjs';
import { validPreviewRecord, validatePreviewRegistry } from './preview-registry.mjs';
import { resolvePublishedDigest } from './publish.mjs';
import { canonicalChecksum, validateManifest } from './validate.mjs';
import { assertManifestVersion, resolveReleaseVersion } from './release-version.mjs';

const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
const safePath = path => typeof path === 'string' && path.length > 0 && !path.includes('\\') && !path.includes('\0') && !path.split('/').some(part => !part || part === '.' || part === '..');

// Verify in memory: no untrusted archive path is ever extracted. Accept only the
// ustar files/directories emitted by our publisher, with bounded decompression.
export async function verifyPreviewArchive(archivePath, record) {
  if (!validPreviewRecord(record)) throw new Error('Invalid preview registry record');
  const compressed = await readFile(archivePath);
  if (compressed.length > 128 * 1024 * 1024) throw new Error('Preview archive is too large');
  const bytes = gunzipSync(compressed, { maxOutputLength: 512 * 1024 * 1024 });
  const names = new Set(), files = new Map();
  const field = (header, start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
  const octal = value => { if (!/^[0-7]+$/.test(value.trim())) throw new Error('Invalid tar number'); return Number.parseInt(value.trim(), 8); };
  let offset = 0, ended = false;
  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) { ended = true; break; }
    const sum = header.reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0);
    if (octal(field(header, 148, 8)) !== sum || field(header, 257, 6) !== 'ustar') throw new Error('Invalid ustar header');
    const type = field(header, 156, 1);
    if (!['', '0', '5'].includes(type) || field(header, 157, 100)) throw new Error('Archive links and special entries are forbidden');
    let path = [field(header, 345, 155), field(header, 0, 100)].filter(Boolean).join('/');
    if (path.startsWith('./')) path = path.slice(2);
    if (type === '5') path = path.replace(/\/$/, '');
    const size = octal(field(header, 124, 12));
    if (!Number.isSafeInteger(size) || (type === '5' && size !== 0) || offset + 512 + size > bytes.length) throw new Error('Invalid archive size');
    if (path && path !== '.') {
      if (!safePath(path) || names.has(path) || names.size >= 10000) throw new Error('Unsafe, duplicate or excessive archive paths');
      names.add(path);
      if (type !== '5') files.set(path, bytes.subarray(offset + 512, offset + 512 + size));
    } else if (type !== '5') throw new Error('Invalid archive root');
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!ended || bytes.subarray(offset).some(byte => byte !== 0)) throw new Error('Truncated or trailing archive data');
  for (const name of names) {
    const parts = name.split('/');
    for (let depth = 1; depth < parts.length; depth++) if (files.has(parts.slice(0, depth).join('/'))) throw new Error('Archive file/directory collision');
  }
  const bundle = JSON.parse(files.get('preview-bundle.json')?.toString('utf8') || 'null');
  if (!bundle || bundle.schemaVersion !== 1 || bundle.templateId !== record.id || bundle.templateVersion !== record.version || bundle.protocolVersion !== record.protocolVersion ||
      bundle.manifestChecksum !== record.manifestChecksum || bundle.sourceCommit !== record.sourceCommit || bundle.bundleDigest !== record.bundleDigest || !Array.isArray(bundle.files)) throw new Error('Bundle identity mismatch');
  const expected = bundle.files.map(entry => entry.path);
  if (!expected.includes('index.html') || expected.some(path => !safePath(path) || path === 'preview-bundle.json') ||
      new Set(expected).size !== expected.length || JSON.stringify(expected) !== JSON.stringify([...expected].sort()) ||
      JSON.stringify([...files.keys()].sort()) !== JSON.stringify([...expected, 'preview-bundle.json'].sort())) throw new Error('Bundle file inventory mismatch');
  if (`sha256:${checksum(JSON.stringify(bundle.files))}` !== record.bundleDigest) throw new Error('Bundle digest mismatch');
  for (const entry of bundle.files) {
    if (Object.keys(entry).length !== 3 || !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.checksum)) throw new Error('Invalid bundle file entry');
    const content = files.get(entry.path);
    if (content.length !== entry.size || checksum(content) !== entry.checksum) throw new Error(`Bundle file checksum mismatch: ${entry.path}`);
  }
  return bundle;
}

async function previewIndex(registryRoot) {
  try { return validatePreviewRegistry(JSON.parse(await readFile(join(registryRoot, 'preview/index.json'), 'utf8'))); }
  catch (cause) { if (cause.code !== 'ENOENT') throw cause; return { schemaVersion: 1, records: [] }; }
}

// The two release workflows share this decision before any build or push. I/O
// callbacks are the external build/OCI boundary; registry and archive checks are
// always performed here, including on successful prior publications.
export async function preparePreviewRelease({ registryRoot, manifest, sourceCommit, archivePath, build, push, pull, requireReleasedImage = false }) {
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw new Error('Invalid preview source commit');
  const manifestChecksum = `sha256:${canonicalChecksum(manifest)}`;
  const index = await previewIndex(registryRoot);
  const previous = index.records.find(record => record.id === manifest.id && record.version === manifest.version);
  if (previous && (previous.sourceCommit !== sourceCommit || previous.manifestChecksum !== manifestChecksum)) throw new Error('Published preview version conflict');
  if (requireReleasedImage) {
    const imageIndex = JSON.parse(await readFile(join(registryRoot, 'registry/index.json'), 'utf8'));
    if (!resolvePublishedDigest(imageIndex, manifest, sourceCommit)) throw new Error('Matching released image required before preview publication');
  }
  if (previous) {
    await pull(previous);
    await verifyPreviewArchive(archivePath, previous);
    return previous;
  }
  const record = { id: manifest.id, version: manifest.version, sourceCommit, manifestChecksum, bundleDigest: await build(),
    artifactDigest: `sha256:${'0'.repeat(64)}`, bundlePath: `templates/${manifest.id}/${manifest.version}`, adapterVersion: '1', protocolVersion: 1, status: 'available' };
  await verifyPreviewArchive(archivePath, record);
  record.artifactDigest = await push();
  if (!validPreviewRecord(record)) throw new Error('Invalid preview artifact digest');
  return record;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.TEMPLATE_VERSION) throw new Error('Exact TEMPLATE_VERSION is required');
  const id = process.env.TEMPLATE_ID, version = resolveReleaseVersion({ templateVersion: process.env.TEMPLATE_VERSION });
  assertManifestVersion({ id, version }, version, id);
  const templateRoot = resolve(`templates/${id}/${version}`), storefront = join(templateRoot, 'storefront');
  const manifest = JSON.parse(await readFile(join(templateRoot, 'template.json'), 'utf8'));
  assertManifestVersion(manifest, version, id);
  await validateManifest(manifest, templateRoot);
  const directory = await mkdtemp(join(process.env.RUNNER_TEMP, 'preview-publication-'));
  const archivePath = join(directory, 'preview-bundle.tar.gz');
  const sourceCommit = process.env.SOURCE_COMMIT, repository = `ghcr.io/tangtianshuo/independent-website-preview-bundles/${id}`;
  const authConfig = join(process.env.DOCKER_CONFIG || join(homedir(), '.docker'), 'config.json');
  const oras = args => execFileSync('docker', ['run', '--rm', '-v', `${directory}:/workspace`, '-w', '/workspace', '-v', `${authConfig}:/auth/config.json:ro`, 'ghcr.io/oras-project/oras:v1.2.3', ...args, '--registry-config', '/auth/config.json'], { encoding: 'utf8' });
  try {
    const record = await preparePreviewRelease({ registryRoot: resolve(process.env.REGISTRY_ROOT || 'registry'), manifest, sourceCommit, archivePath, requireReleasedImage: process.env.REQUIRE_RELEASED_IMAGE === '1',
      async build() {
        execFileSync('npm', ['ci'], { cwd: storefront, stdio: 'inherit' });
        execFileSync('npm', ['test'], { cwd: storefront, stdio: 'inherit' });
        execFileSync('npm', ['run', 'build:preview'], { cwd: storefront, stdio: 'inherit', env: { ...process.env, PREVIEW_APP_BASE_URL: `/preview/${id}/${version}/` } });
        const bundle = await buildPreviewBundle({ publicDir: join(storefront, '.output/public'), outputDir: join(directory, 'bundle'), templateId: id, templateVersion: version, sourceCommit, manifestChecksum: `sha256:${canonicalChecksum(manifest)}` });
        execFileSync('tar', ['--format=ustar', '--sort=name', '--mtime=UTC 1970-01-01', '--owner=0', '--group=0', '--numeric-owner', '-czf', archivePath, '-C', join(directory, 'bundle'), '.']);
        return bundle.bundleDigest;
      },
      async push() {
        return oras(['push', repository, 'preview-bundle.tar.gz', '--artifact-type', 'application/vnd.bcms.preview.bundle.v1', '--annotation', 'org.opencontainers.image.created=1970-01-01T00:00:00Z', '--annotation', `org.opencontainers.image.revision=${sourceCommit}`, '--format', 'go-template={{.digest}}']).trim();
      },
      async pull(record) {
        oras(['pull', `${repository}@${record.artifactDigest}`, '--output', '/workspace']);
      },
    });
    await appendFile(process.env.GITHUB_OUTPUT, `bundle_digest=${record.bundleDigest}\nartifact_digest=${record.artifactDigest}\nadapter_version=${record.adapterVersion}\n`);
    console.log(`Verified preview ${record.id}@${record.version} ${record.artifactDigest}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
