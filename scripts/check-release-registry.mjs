import { appendFile, readFile } from 'node:fs/promises';
import { resolvePublishedDigest } from './publish.mjs';

const version = process.env.GITHUB_REF_NAME?.replace(/^aeroframe-v/, '');
const sourceCommit = process.env.SOURCE_COMMIT;
const manifest = JSON.parse(await readFile(`templates/aeroframe/${version}/template.json`, 'utf8'));
if (manifest.id !== 'aeroframe' || manifest.version !== version) throw new Error('Release tag does not match manifest');
const index = JSON.parse(await readFile('registry/registry/index.json', 'utf8'));
const digest = resolvePublishedDigest(index, manifest, sourceCommit);
await appendFile(process.env.GITHUB_OUTPUT, `digest=${digest || ''}\n`);
