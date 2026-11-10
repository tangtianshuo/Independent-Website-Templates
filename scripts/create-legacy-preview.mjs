import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const versions = ['1.0.0', '1.0.1', '1.0.2'];
const sharedSource = join(root, 'templates/aeroframe/1.0.3/storefront/shared/snapshot.mjs');
const previewTestSource = join(root, 'templates/aeroframe/1.0.3/storefront/test/preview.test.mjs');
const previewManifest = JSON.parse(await readFile(join(root, 'templates/aeroframe/1.0.3/template.json'), 'utf8'));

function page(source, version) {
    const template = source.match(/<template>([\s\S]*)<\/template>/)?.[1];
    if (!template) throw new Error('Legacy AeroFrame page has no template');
    const clickable = template.replace('<div class="aero-site">', '<div class="aero-site" @click.capture="handleLink">');
    return `<script setup lang="ts">
const props = defineProps<{ published: any }>();
const emit = defineEmits<{ navigate: [path: string] }>();
const content = computed(() => props.published.content);
const demo = computed(() => content.value.preset.demo);
const showcase = computed(() => content.value.preset.showcase);
const view = computed(() => content.value.view);
const show = (section: string) => content.value.sections.includes(section);
const menuOpen = ref(false);
const collectionPath = computed(() => props.published.navigation.find((link: any) => link.path === '/collections')?.path || '/collections');
const companyPath = computed(() => props.published.navigation.find((link: any) => /about|company|story|page/i.test(link.label))?.path || '/');
const quoteHref = computed(() => demo.value.contactEmail ? \`mailto:\${encodeURIComponent(demo.value.contactEmail)}?subject=Project%20inquiry\` : 'mailto:');
function handleLink(event: MouseEvent) {
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href?.startsWith('/')) return;
    event.preventDefault();
    event.stopPropagation();
    emit('navigate', href);
}
</script>

<template>${clickable}</template>
`;
}

function previewPage(version) {
    return `<script setup lang="ts">
import { acceptPreviewMessage, previewAdminOrigin, previewPage } from '#preview-shared/snapshot.mjs';
import LegacyPage from '../components/PreviewPage.vue';

const adminOrigin = previewAdminOrigin(useRuntimeConfig().public.previewAdminOrigin);
const snapshot = shallowRef<any>(null);
const page = shallowRef<any>(null);
const status = ref('Waiting for a private CMS preview.');
let expires: ReturnType<typeof setTimeout> | undefined;
function navigate(path: string) {
  let target = previewPage(snapshot.value, path);
  if (target && 'redirect' in target) target = previewPage(snapshot.value, target.redirect);
  if (!target || 'redirect' in target) { status.value = 'This page is not in the current preview.'; return; }
  page.value = target;
  status.value = '';
}
function receive(event: MessageEvent) {
  const accepted = acceptPreviewMessage(event, { adminOrigin, parent: window.parent, self: window });
  if (!accepted) return;
  snapshot.value = accepted.snapshot;
  navigate(accepted.path);
  clearTimeout(expires);
  expires = setTimeout(() => { snapshot.value = null; page.value = null; status.value = 'Preview expired. Refresh it from the CMS.'; }, 10 * 60 * 1000);
}
onMounted(() => {
  window.addEventListener('message', receive);
  if (adminOrigin && window.parent !== window) window.parent.postMessage({ type: 'storefront:preview-ready', templateId: 'aeroframe', templateVersion: '${version}' }, adminOrigin);
});
onBeforeUnmount(() => { window.removeEventListener('message', receive); clearTimeout(expires); });
useHead({ title: 'Private CMS preview', meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive' }] });
</script>

<template>
  <div>
    <p v-if="status" role="status">{{ status }}</p>
    <LegacyPage v-if="page" :published="page" @navigate="navigate" />
  </div>
</template>
`;
}

function config() {
    return `import { fileURLToPath, URL } from 'node:url';

export default defineNuxtConfig({
  css: ['~/assets/main.css'],
  app: { baseURL: process.env.PREVIEW_APP_BASE_URL || '/' },
  alias: { '#preview-shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  nitro: { prerender: { crawlLinks: false, routes: process.env.PREVIEW_APP_BASE_URL ? ['/preview/'] : [] } },
  runtimeConfig: {
    gatewayUrl: '',
    workspaceId: '',
    siteId: '',
    siteCredential: '',
    releaseId: process.env.RELEASE_ID || '',
    public: { previewAdminOrigin: '' },
  },
});
`;
}

for (const version of versions) {
    const storefront = join(root, `templates/aeroframe/${version}/storefront`);
    const sourcePath = join(storefront, version === '1.0.2' ? 'pages/[[...path]].vue' : 'app/pages/[[...path]].vue');
    const pagesDir = version === '1.0.2' ? join(storefront, 'pages') : join(storefront, 'app/pages');
    const componentsDir = version === '1.0.2' ? join(storefront, 'components') : join(storefront, 'app/components');
    const publishedPath = join(storefront, 'server/utils/published.mjs');
    const source = await readFile(sourcePath, 'utf8');
    const shared = (await readFile(sharedSource, 'utf8'))
        .replace("page.content.preset.version !== '1.0.3'", `page.content.preset.version !== '${version}'`);
    const previewTest = (await readFile(previewTestSource, 'utf8'))
        .replaceAll("'1.0.3'", `'${version}'`)
        .replaceAll('/1.0.3/', `/${version}/`)
        .replace('...manifest.presentation', '...presentation')
        .replace('const content =', `const presentation = ${JSON.stringify(previewManifest.presentation)};\nconst content =`)
        .replace(/for \(const \[id, version\] of \[.*?\]\) \{/,
            `for (const [id, version] of [['aeroframe', '9.9.9'], ['another-template', '${version}']]) {`);
    await mkdir(join(storefront, 'shared'), { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await writeFile(join(storefront, 'shared/snapshot.mjs'), shared);
    await writeFile(join(componentsDir, 'PreviewPage.vue'), page(source, version));
    await writeFile(join(pagesDir, 'preview.vue'), previewPage(version));
    await writeFile(join(storefront, 'test/preview.test.mjs'), previewTest);
    const published = await readFile(publishedPath, 'utf8');
    const marker = '// preview-adapter-exports';
    if (!published.includes(marker)) {
        await writeFile(publishedPath, `${published.trimEnd()}\n\n${marker}\nexport { previewPage, acceptPreviewMessage, previewAdminOrigin, previewHeaders } from '../../shared/snapshot.mjs';\n`);
    }
    await writeFile(join(storefront, 'nuxt.config.ts'), config());
}
