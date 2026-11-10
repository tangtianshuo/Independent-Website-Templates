import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

async function files(root, current = root) {
    const result = [];
    for (const entry of await readdir(current, { withFileTypes: true })) {
        const absolute = join(current, entry.name);
        if (entry.isDirectory()) result.push(...await files(root, absolute));
        else if (entry.isFile()) result.push(relative(root, absolute).split('\\').join('/'));
        else throw new Error(`Preview bundle contains an unsupported file: ${absolute}`);
    }
    return result.sort();
}

export async function buildPreviewBundle({ publicDir, outputDir, templateId, templateVersion, protocolVersion = 1 }) {
    if (!idPattern.test(templateId) || !versionPattern.test(templateVersion) || protocolVersion !== 1) {
        throw new Error('Invalid preview bundle identity');
    }
    const generated = resolve(publicDir);
    const output = resolve(outputDir);
    try {
        if ((await readdir(output)).length) throw new Error(`Preview output directory is not empty: ${output}`);
    } catch (cause) {
        if (cause?.code !== 'ENOENT') throw cause;
    }
    const previewHtml = await readFile(join(generated, 'preview', 'index.html'));
    const expectedBase = `/preview/${templateId}/${templateVersion}/`;
    if (!previewHtml.toString('utf8').includes(expectedBase)) {
        throw new Error(`Preview HTML does not use the registered base path ${expectedBase}`);
    }
    await mkdir(output, { recursive: true });
    await cp(join(generated, '_nuxt'), join(output, '_nuxt'), { recursive: true });
    await cp(join(generated, 'preview', 'index.html'), join(output, 'index.html'));
    try {
        await cp(join(generated, 'preview', '_payload.json'), join(output, 'preview', '_payload.json'));
    } catch {
        // Route payloads are optional; the preview shell can run without them.
    }
    const entries = [];
    for (const file of await files(output)) {
        const bytes = await readFile(join(output, file));
        entries.push({ path: file, size: bytes.byteLength, checksum: createHash('sha256').update(bytes).digest('hex') });
    }
    const bundleDigest = `sha256:${createHash('sha256').update(JSON.stringify(entries)).digest('hex')}`;
    const manifest = {
        schemaVersion: 1,
        templateId,
        templateVersion,
        protocolVersion,
        bundleDigest,
        files: entries,
    };
    await writeFile(join(output, 'preview-bundle.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
}

function argument(name) {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
    const manifest = await buildPreviewBundle({
        publicDir: argument('public-dir'),
        outputDir: argument('output-dir'),
        templateId: argument('template-id'),
        templateVersion: argument('template-version'),
    });
    console.log(JSON.stringify({ bundleDigest: manifest.bundleDigest, files: manifest.files.length }));
}
