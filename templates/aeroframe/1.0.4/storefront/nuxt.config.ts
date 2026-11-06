import { fileURLToPath, URL } from 'node:url';

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
    publishedSnapshotPath: process.env.PUBLISHED_SNAPSHOT_PATH || '',
    public: { previewAdminOrigin: '', leadEndpoint: process.env.NUXT_PUBLIC_LEAD_ENDPOINT || '' },
    releaseId: process.env.RELEASE_ID || '',
  },
});
