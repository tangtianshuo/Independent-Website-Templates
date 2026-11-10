import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

for (const [id, version] of [
  ['aeroframe', '1.0.6'],
  ['fireguard', '1.0.2'],
]) {
  const root = new URL(`../templates/${id}/${version}/storefront/`, import.meta.url);
  const require = createRequire(new URL('package.json', root));
  const esbuild = require('esbuild');
  const vue = require('vue');
  const { parse, compileScript } = require('@vue/compiler-sfc');
  function evaluate(source, globals = {}) {
    const code = esbuild.transformSync(source, {
      loader: 'ts',
      format: 'cjs',
      target: 'es2022',
    }).code;
    const context = { exports: {}, module: { exports: {} }, require, Error, ...globals };
    vm.runInNewContext(code, context);
    return context.module.exports.default;
  }
  test(`${id} analytics sends once per page, uses intake, and tolerates disabled storage and network`, async () => {
    const calls = [];
    const storage = new Map();
    const plugin = evaluate(await readFile(new URL('plugins/analytics.client.ts', root), 'utf8'), {
      defineNuxtPlugin: (fn) => fn,
      useRuntimeConfig: () => ({ public: { ingestOrigin: 'https://intake.example' } }),
      crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
      window: { innerWidth: 900 },
      document: { referrer: '' },
      localStorage: {
        getItem: (key) => storage.get(key),
        setItem: (key, value) => storage.set(key, value),
      },
      sessionStorage: {
        getItem: (key) => storage.get(key),
        setItem: (key, value) => storage.set(key, value),
      },
      $fetch: async (url, options) => {
        calls.push({ url, options });
        throw Error('offline');
      },
    });
    const { provide } = plugin();
    const page = { siteId: 'site-a', path: '/catalog' };
    provide.trackPageView(page, false);
    provide.trackPageView(page, false);
    provide.trackPageView({ ...page, path: '/company' }, true);
    provide.trackPageView({ ...page, path: '/company' }, false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, 'https://intake.example/api/v1/sites/site-a/events');
    assert.equal(calls[0].options.body.path, '/catalog');
    assert.ok(!calls[0].options.headers?.authorization);
    const blocked = evaluate(await readFile(new URL('plugins/analytics.client.ts', root), 'utf8'), {
      defineNuxtPlugin: (fn) => fn,
      useRuntimeConfig: () => ({ public: { ingestOrigin: 'https://intake.example' } }),
      crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
      window: { innerWidth: 900 },
      document: { referrer: '' },
      localStorage: {
        getItem: () => {
          throw Error('blocked');
        },
      },
      $fetch: async () => {
        throw Error('offline');
      },
    });
    assert.doesNotThrow(() => blocked().provide.trackPageView(page, false));
  });
  test(`${id} lead retry retains input and the same idempotency key until success`, async () => {
    const source = await readFile(new URL('components/LeadForm.vue', root), 'utf8');
    const { descriptor } = parse(source);
    const script = compileScript(descriptor, { id: 'lead-test' });
    const calls = [];
    let failing = true;
    const component = evaluate(script.content, {
      ...vue,
      crypto: { randomUUID: () => String(Math.random()) },
      $fetch: async (url, options) => {
        calls.push({ url, options });
        if (failing) throw Error('internal intake address');
      },
    });
    const state = component.setup(
      { siteId: 'site-a', endpoint: 'https://intake.example' },
      { expose: () => {} },
    );
    state.name.value = 'Visitor';
    state.email.value = 'visitor@example.test';
    state.message.value = 'Please call';
    await state.submit();
    assert.equal(state.state.value, 'error');
    assert.equal(state.email.value, 'visitor@example.test');
    assert.equal(state.message.value, 'Please call');
    assert.ok(!state.errorMessage.value.includes('internal intake address'));
    failing = false;
    await state.submit();
    assert.equal(state.state.value, 'success');
    assert.equal(state.email.value, '');
    assert.equal(
      calls[0].options.headers['x-lead-idempotency-key'],
      calls[1].options.headers['x-lead-idempotency-key'],
    );
    assert.equal(calls[0].url, 'https://intake.example/api/v1/sites/site-a/leads');
  });
}
