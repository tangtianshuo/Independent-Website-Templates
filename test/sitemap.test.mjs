import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { contractFixture } from './contract-fixture.mjs';
for (const [id, version] of [['aeroframe', '1.0.4'], ['fireguard', '1.0.1']]) {
  test(`${id} sitemap lists validated concrete artifact routes and rejects unsafe origins`, async () => {
    const { readSitemap } = await import(`../templates/${id}/${version}/storefront/server/utils/sitemap.mjs`);
    const dir = await mkdtemp(path.join(tmpdir(), 'sitemap-'));
    const file = path.join(dir, 'snapshot.json');
    try {
      const snapshot = contractFixture(); snapshot.template = { id, version }; snapshot.pages[0].content.preset.id = id; snapshot.pages[0].content.preset.version = version;
      snapshot.pages.push({ ...structuredClone(snapshot.pages[0]), path: '/product/a&b', entryId: 'product' }, { ...structuredClone(snapshot.pages[0]), path: '/product/:slug', entryId: 'blueprint' });
      await writeFile(file, JSON.stringify(snapshot));
      const options = { snapshotPath: file, workspaceId: 'workspace', siteId: 'site', host: 'shop.example.com' };
      const xml = await readSitemap(options);
      assert.ok(xml.includes('<loc>https://shop.example.com/</loc>'));
      assert.ok(xml.includes('<loc>https://shop.example.com/product/a&amp;b</loc>'));
      assert.ok(!xml.includes(':slug')); assert.ok(!xml.includes('/preview')); assert.ok(!xml.includes('/api/'));
      for (const host of ['evil.com/path', 'user@host', 'host:999999', '<script>', 'a..b']) await assert.rejects(readSitemap({ ...options, host }));
      await assert.rejects(readSitemap({ ...options, siteId: 'foreign' }));
      await writeFile(file, 'broken'); await assert.rejects(readSitemap(options));
      await rm(file); await assert.rejects(readSitemap(options));
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
}
