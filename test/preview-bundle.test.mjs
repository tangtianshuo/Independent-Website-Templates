import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { buildPreviewBundle } from '../scripts/preview-bundle.mjs';
import { appendPreviewRecord, validPreviewRecord } from '../scripts/preview-registry.mjs';

test('builds a content-addressed preview bundle from generated static output', async t => {
    const root = await mkdtemp(join(tmpdir(), 'preview-bundle-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const generated = join(root, 'generated');
    const output = join(root, 'bundle');
    await mkdir(join(generated, '_nuxt'), { recursive: true });
    await mkdir(join(generated, 'preview'), { recursive: true });
    await writeFile(join(generated, 'index.html'), '<script src="/preview/fireguard/1.0.0/_nuxt/app.js"></script>');
    await writeFile(join(generated, 'preview', '_payload.json'), '{}');
    await writeFile(join(generated, '_nuxt', 'app.js'), 'console.log("preview")');
    const manifest = await buildPreviewBundle({
        publicDir: generated, outputDir: output,
        templateId: 'fireguard', templateVersion: '1.0.0', manifestChecksum: `sha256:${'a'.repeat(64)}`, sourceCommit: 'b'.repeat(40),
    });
    assert.match(manifest.bundleDigest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(manifest.files.length, 3);
    assert.equal((await readFile(join(output, 'index.html'), 'utf8')).includes('/preview/fireguard/1.0.0/'), true);
    assert.equal(JSON.parse(await readFile(join(output, 'preview-bundle.json'), 'utf8')).bundleDigest, manifest.bundleDigest);
});

test('preview registry rejects mutable replacements and malformed identities', () => {
    const record = {
        id: 'fireguard', version: '1.0.0',
        manifestChecksum: `sha256:${'a'.repeat(64)}`, sourceCommit: 'b'.repeat(40),
        bundleDigest: `sha256:${'c'.repeat(64)}`,
        artifactDigest: `sha256:${'d'.repeat(64)}`,
        bundlePath: 'templates/fireguard/1.0.0', adapterVersion: '1', protocolVersion: 1, status: 'available',
    };
    assert.equal(validPreviewRecord(record), true);
    const registry = appendPreviewRecord({ schemaVersion: 1, records: [] }, record);
    assert.equal(appendPreviewRecord(registry, record), registry);
    assert.throws(() => appendPreviewRecord(registry, { ...record, bundleDigest: `sha256:${'e'.repeat(64)}` }), /conflict/i);
    assert.equal(validPreviewRecord({ ...record, protocolVersion: 2 }), false);
});
