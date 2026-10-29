export default defineNuxtConfig({
  css: ['~/assets/main.css'],
  runtimeConfig: {
    gatewayUrl: '',
    workspaceId: '',
    siteId: '',
    siteCredential: '',
    public: { previewAdminOrigin: '' },
    releaseId: process.env.RELEASE_ID || '',
  },
});
