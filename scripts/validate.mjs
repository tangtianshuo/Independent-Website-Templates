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

function validateEditorContract(manifest) {
  const editor = manifest.editor;
  const renderer = manifest.renderer;
  if (!editor || !renderer) {
    throw new Error('Invalid manifest: editor and renderer contracts are required');
  }
  if (renderer.templateId !== manifest.id || renderer.templateVersion !== manifest.version) {
    throw new Error('Invalid renderer identity');
  }
  const modelKeys = new Set(manifest.models.map(({ key }) => key));
  const pageKeys = new Set(manifest.pages.map(({ key }) => key));
  const sectionKeys = new Set(editor.sections.map(({ type }) => type));
  unique(editor.models.map(({ modelKey }) => modelKey), 'editor model key');
  unique(editor.pages.map(({ pageKey }) => pageKey), 'editor page key');
  unique(editor.sections.map(({ type }) => type), 'editor section type');
  for (const model of editor.models) {
    if (!modelKeys.has(model.modelKey)) throw new Error(`Unknown editor model: ${model.modelKey}`);
    unique(model.fields.map(({ key }) => key), `editor field key in ${model.modelKey}`);
  }
  for (const page of editor.pages) {
    if (!pageKeys.has(page.pageKey)) throw new Error(`Unknown editor page: ${page.pageKey}`);
    const manifestPage = manifest.pages.find(({ key }) => key === page.pageKey);
    if (page.modelKey !== manifestPage.modelKey || !modelKeys.has(page.modelKey)) throw new Error(`Invalid editor page model: ${page.pageKey}`);
    if (page.pathRule.type === 'fixed' && page.pathRule.value !== manifestPage.path) throw new Error(`Invalid fixed editor path: ${page.pageKey}`);
    if (page.pathRule.type === 'pattern' && !/^\/(?:[a-z0-9-]+|:[a-z][a-z0-9]*)(?:\/(?:[a-z0-9-]+|:[a-z][a-z0-9]*))*$/.test(page.pathRule.value)) {
      throw new Error(`Invalid editor path rule: ${page.pageKey}`);
    }
    if (page.pathRule.type === 'pattern') {
      const params = [...page.pathRule.value.matchAll(/:([a-z][a-z0-9]*)/g)].map(([, name]) => name);
      if (new Set(params).size !== params.length) throw new Error(`Duplicate editor path parameter: ${page.pageKey}`);
    }
    unique(page.sections, `editor section reference in ${page.pageKey}`);
    for (const section of page.sections) if (!sectionKeys.has(section)) throw new Error(`Unknown editor section: ${section}`);
  }
  for (const section of editor.sections) {
    unique(section.allowedPages, `allowed page in ${section.type}`);
    for (const page of section.allowedPages) if (!pageKeys.has(page)) throw new Error(`Unknown section page: ${page}`);
    for (const prop of Object.values(section.props)) {
      if (prop.control === 'enum' && (!Array.isArray(prop.options) || prop.options.length === 0)) throw new Error(`Enumeration options required: ${section.type}`);
    }
  }
  for (const migration of manifest.compatibility.migrations ?? []) {
    if (migration.to !== `${manifest.id}@${manifest.version}`) throw new Error(`Invalid migration target: ${migration.to}`);
    if (!migration.from.startsWith(`${manifest.id}@`)) throw new Error(`Invalid migration source: ${migration.from}`);
    if (migration.from === migration.to) throw new Error('Invalid migration identity');
  }
}

export async function validateManifest(manifest, root) {
  if (!checkSchema(manifest)) throw new Error(`Invalid manifest: ${new Ajv().errorsText(checkSchema.errors)}`);
  if (!manifest.presentation && !(manifest.id === 'aeroframe' && manifest.version === '1.0.0')) {
    throw new Error('Invalid manifest: presentation is required for public releases');
  }
  const legacy = (manifest.id === 'aeroframe' && ['1.0.0', '1.0.1', '1.0.2', '1.0.3'].includes(manifest.version)) ||
    (manifest.id === 'fireguard' && manifest.version === '1.0.0');
  if (!legacy || manifest.editor || manifest.renderer) validateEditorContract(manifest);
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
