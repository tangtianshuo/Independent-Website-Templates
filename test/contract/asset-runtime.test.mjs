import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readPublishedAsset } from '../../templates/aeroframe/1.0.4/storefront/server/utils/published-assets.mjs';

test('published runtime reads embedded asset bytes from its local snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'published-assets-'));
  try {
    const bytes = Buffer.from('hello asset');
    const checksum = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const snapshotPath = join(directory, 'snapshot.json');
    await writeFile(snapshotPath, JSON.stringify({ contractVersion: 1, assets: [{ path: 'media/a/original.txt', checksum, mimeType: 'text/plain', contentBase64: bytes.toString('base64') }] }));
    const result = await readPublishedAsset({ snapshotPath, path: 'media/a/original.txt' });
    assert.equal(result.mimeType, 'text/plain');
    assert.deepEqual(result.bytes, bytes);
    assert.equal(await readPublishedAsset({ snapshotPath, path: '../secret' }), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
