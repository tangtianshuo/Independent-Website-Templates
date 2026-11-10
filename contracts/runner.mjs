import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import contractSchema from './schema-v1/contract-snapshot.schema.json' with { type: 'json' };
import { validatePublishedAssets } from './assets.mjs';
import { validateManifest } from '../scripts/validate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validateContract = ajv.compile(contractSchema);

function fail(message) {
  throw new Error(`Contract runner: ${message}`);
}

export async function runContract({ snapshot, templateRoot }) {
  if (!validateContract(snapshot)) fail(`invalid snapshot: ${ajv.errorsText(validateContract.errors)}`);
  const root = resolve(templateRoot);
  const manifest = JSON.parse(await readFile(resolve(root, 'template.json'), 'utf8'));
  await validateManifest(manifest, root);
  if (snapshot.template.id !== manifest.id || snapshot.template.version !== manifest.version) {
    fail(`template identity mismatch: ${snapshot.template.id}@${snapshot.template.version}`);
  }
  const knownAssets = new Set(manifest.assets.map(({ path }) => path));
  const basePath = manifest.renderer.assets.basePath;
  if (!validatePublishedAssets(snapshot.assets, undefined, basePath)) fail('invalid published assets');
  for (const asset of snapshot.assets) {
    if (!knownAssets.has(asset.path) && !(asset.path.startsWith('media/') && asset.contentBase64)) fail(`unauthorized asset: ${asset.path}`);
    if (asset.url !== undefined && !asset.url.startsWith(basePath)) fail(`asset outside published base path: ${asset.path}`);
  }
  const runtime = await import(pathToFileURL(resolve(root, 'storefront/shared/snapshot.mjs')).href);
  const runtimeSnapshot = runtime.normalizeContractSnapshot(snapshot);
  for (const page of snapshot.pages) {
    if (!runtime.snapshotPage(runtimeSnapshot, page.path)) fail(`renderer rejected page: ${page.path}`);
  }
  return { manifest, pages: snapshot.pages.map(({ path }) => path) };
}

export async function runContractFile(snapshotPath, templateRoot) {
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  return runContract({ snapshot, templateRoot });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const [snapshotPath, templateRoot = resolve(here, '../templates/aeroframe/1.0.4')] = process.argv.slice(2);
  if (!snapshotPath) throw new Error('Usage: node contracts/runner.mjs <snapshot.json> [template-root]');
  await runContractFile(snapshotPath, templateRoot);
  console.log(`Contract valid: ${snapshotPath}`);
}
