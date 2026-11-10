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
    public: { previewAdminOrigin: '' },
    releaseId: process.env.RELEASE_ID || '',
  },
});
