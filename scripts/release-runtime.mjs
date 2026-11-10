import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertManifestVersion, resolveReleaseVersion } from './release-version.mjs';
import { validateManifest } from './validate.mjs';

// Renderer contract v1 is the artifact-only public runtime contract. Manifests
// predating that declaration retain their Gateway runtime validation.
export function runtimeGateFor(manifest) {
  if (!Object.hasOwn(manifest, 'renderer')) return 'legacy';
  const renderer = manifest.renderer;
  if (!renderer || renderer.contractVersion !== 1 || renderer.templateId !== manifest.id || renderer.templateVersion !== manifest.version) {
    throw new Error('Unsupported or mismatched renderer contract');
  }
  return 'artifact';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.TEMPLATE_VERSION) throw new Error('Exact TEMPLATE_VERSION is required');
  const id = process.env.TEMPLATE_ID, version = resolveReleaseVersion({ templateVersion: process.env.TEMPLATE_VERSION });
  assertManifestVersion({ id, version }, version, id);
  const root = resolve(`templates/${id}/${version}`);
  const manifest = JSON.parse(await readFile(resolve(root, 'template.json'), 'utf8'));
  assertManifestVersion(manifest, version, id);
  await validateManifest(manifest, root);
  const gate = runtimeGateFor(manifest);
  console.log(`Selected ${id}@${version} ${gate} runtime gate`);
  const result = spawnSync(process.execPath, ['--test', gate === 'artifact' ? 'test/contract/built-runtime.test.mjs' : 'test/runtime.test.mjs'], {
    stdio: 'inherit', env: { ...process.env, TEST_BUILT_CONTRACT: gate === 'artifact' ? '1' : '', TEST_BUILT_TEMPLATE: gate === 'legacy' ? '1' : '' },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
