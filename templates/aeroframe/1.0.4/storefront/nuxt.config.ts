import { fileURLToPath, URL } from 'node:url';

export default defineNuxtConfig({
  css: ['~/assets/main.css'],
  app: { baseURL: process.env.PREVIEW_APP_BASE_URL || '/' },
  ...(process.env.PREVIEW_APP_BASE_URL ? { experimental: { appManifest: false, payloadExtraction: false } } : {}),
  alias: { '#preview-shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  nitro: { prerender: { crawlLinks: false, routes: process.env.PREVIEW_APP_BASE_URL ? ['/'] : [] } },
  hooks: { 'pages:extend'(pages) {
    if (!process.env.PREVIEW_APP_BASE_URL) return;
    const preview = pages.find(page => page.path === '/preview');
    if (!preview) throw new Error('Preview entry page is missing');
    preview.path = '/';
  } },
  runtimeConfig: {
    gatewayUrl: '',
    workspaceId: '',
    siteId: '',
    siteCredential: '',
    publishedSnapshotPath: process.env.PUBLISHED_SNAPSHOT_PATH || '',
    public: { previewAdminOrigin: '', ingestOrigin: process.env.NUXT_PUBLIC_INGEST_ORIGIN || '' },
    releaseId: process.env.RELEASE_ID || '',
  },
});
