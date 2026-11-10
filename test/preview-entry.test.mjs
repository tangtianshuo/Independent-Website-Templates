import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
for (const [id, version] of [['aeroframe', '1.0.4'], ['fireguard', '1.0.1']]) {
  test(`${id} preview build maps the actual preview route to the exact descriptor root only in preview mode`, async () => {
    const source = await readFile(new URL(`../templates/${id}/${version}/storefront/nuxt.config.ts`, import.meta.url), 'utf8');
    const hook = source.match(/'pages:extend'\(pages\) \{([\s\S]*?)\n  \} \}/);
    assert.ok(hook);
    const run = new Function('pages', 'process', hook[1]);
    for (const preview of [false, true]) {
      const pages = [{ path: '/preview', file: 'preview.vue' }, { path: '/:slug(.*)*', file: 'public.vue' }];
      run(pages, { env: preview ? { PREVIEW_APP_BASE_URL: `/preview/${id}/${version}/` } : {} });
      assert.equal(pages[0].path, preview ? '/' : '/preview');
      assert.equal(pages[1].path, '/:slug(.*)*');
    }
  });
}
