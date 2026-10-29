import { appendFile, readFile } from 'node:fs/promises';
import { resolvePublishedDigest } from './publish.mjs';
import { assertManifestVersion, resolveReleaseVersion } from './release-version.mjs';

const version = resolveReleaseVersion({ templateVersion: process.env.TEMPLATE_VERSION, refName: process.env.GITHUB_REF_NAME });
const sourceCommit = process.env.SOURCE_COMMIT;
const templateId = process.env.TEMPLATE_ID || 'aeroframe';
assertManifestVersion({ id: templateId, version }, version, templateId);
const manifest = JSON.parse(await readFile(`templates/${templateId}/${version}/template.json`, 'utf8'));
assertManifestVersion(manifest, version, templateId);
const index = JSON.parse(await readFile('registry/registry/index.json', 'utf8'));
const digest = resolvePublishedDigest(index, manifest, sourceCommit);
await appendFile(process.env.GITHUB_OUTPUT, `digest=${digest || ''}\n`);
