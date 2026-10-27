import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const schema = JSON.parse(await readFile(new URL('../schema/template.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const checkSchema = ajv.compile(schema);
const mimeByExtension = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}

export function canonicalChecksum(value) {
  const json = JSON.stringify(canonical(value));
  if (json === undefined) throw new Error('Expected JSON value');
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

function unique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`);
}

function routesConflict(first, second) {
  const a = first.split('/');
  const b = second.split('/');
  return a.length === b.length && a.every((part, index) => part === b[index] || part.startsWith(':') || b[index].startsWith(':'));
}

function imageMatches(bytes, mimeType) {
  if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (mimeType === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6));
  if (mimeType === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (mimeType === 'image/avif') return bytes.toString('ascii', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(bytes.toString('ascii', 8, 12));
  return false;
}

export async function validateManifest(manifest, root) {
  if (!checkSchema(manifest)) throw new Error(`Invalid manifest: ${new Ajv().errorsText(checkSchema.errors)}`);
  if (!manifest.presentation && !(manifest.id === 'aeroframe' && manifest.version === '1.0.0')) {
    throw new Error('Invalid manifest: presentation is required for public releases');
  }
  const models = new Set(manifest.models.map(({ key }) => key));
  unique(manifest.models.map(({ key }) => key), 'model key');
  for (const model of manifest.models) {
    unique(model.fields.map(({ key }) => key), `field key in ${model.key}`);
    for (const field of model.fields) {
      if (field.type === 'ENTRY_POINTER' ? !field.referenceModel || !models.has(field.referenceModel) : field.referenceModel !== undefined) {
        throw new Error(`Invalid field reference: ${model.key}.${field.key}`);
      }
    }
  }
  unique(manifest.pages.map(({ key }) => key), 'page key');
  unique(manifest.assets.map(({ path }) => path), 'asset path');
  for (let i = 0; i < manifest.pages.length; i++) {
    const page = manifest.pages[i];
    if (!models.has(page.modelKey)) throw new Error(`Unknown page model: ${page.modelKey}`);
    if (page.path !== '/products/:slug' && /^(?:api|preview|presets|products|_nuxt|__nuxt|sitemap\.xml|robots\.txt)$/.test(page.path.split('/')[1])) {
      throw new Error(`Reserved route: ${page.path}`);
    }
    for (const other of manifest.pages.slice(i + 1)) {
      if (routesConflict(page.path, other.path)) throw new Error(`Conflicting page paths: ${page.path}, ${other.path}`);
    }
  }
  const base = resolve(root instanceof URL ? fileURLToPath(root) : root);
  for (const asset of manifest.assets) {
    const extension = asset.path.split('.').at(-1);
    if (mimeByExtension[extension] !== asset.mimeType) throw new Error(`Asset extension/MIME mismatch: ${asset.path}`);
    const absolute = resolve(base, asset.path);
    if (!absolute.startsWith(base + sep)) throw new Error(`Asset escapes root: ${asset.path}`);
    let current = absolute;
    while (current !== base) {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Symlink in asset path: ${asset.path}`);
      if (current === absolute ? !stat.isFile() : !stat.isDirectory()) throw new Error(`Invalid asset path: ${asset.path}`);
      current = dirname(current);
    }
    const bytes = await readFile(absolute);
    if (!imageMatches(bytes, asset.mimeType)) throw new Error(`Invalid image bytes: ${asset.path}`);
    if (createHash('sha256').update(bytes).digest('hex') !== asset.checksum) throw new Error(`Asset checksum mismatch: ${asset.path}`);
  }
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) throw new Error('Usage: node scripts/validate.mjs <template.json>');
  const path = resolve(input);
  await validateManifest(JSON.parse(await readFile(path, 'utf8')), dirname(path));
  console.log(`Valid: ${path}`);
}
