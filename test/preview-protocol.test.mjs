import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

for (const [templateId, templateVersion] of [['aeroframe', '1.0.4'], ['fireguard', '1.0.1']]) {
  test(`${templateId} ${templateVersion} announces protocol 1 and its exact identity only to the configured CMS parent`, async () => {
    const source = await readFile(new URL(`../templates/${templateId}/${templateVersion}/storefront/pages/preview.vue`, import.meta.url), 'utf8');
    // Execute the actual lifecycle producer; Nuxt's auto imports only register this callback.
    const mounted = source.match(/onMounted\(\(\) => \{([\s\S]*?)\n\}\);/);
    assert.ok(mounted, 'preview must register a mounted callback');
    const mount = new Function('window', 'adminOrigin', 'receive', mounted[1]);
    const messages = [];
    const receive = () => {};
    const window = { parent: { postMessage: (...args) => messages.push(args) },
      addEventListener: (name, listener) => { assert.equal(name, 'message'); assert.equal(listener, receive); } };
    mount(window, 'https://cms.example', receive);
    assert.deepEqual(messages, [[{ type: 'storefront:preview-ready', templateId, templateVersion, protocolVersion: 1 }, 'https://cms.example']]);
    messages.length = 0;
    mount(window, '', receive);
    assert.deepEqual(messages, []);
    window.parent = window;
    mount(window, 'https://cms.example', receive);
    assert.deepEqual(messages, []);
  });
}
