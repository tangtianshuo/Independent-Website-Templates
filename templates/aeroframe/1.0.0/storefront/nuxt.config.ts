export default defineNuxtConfig({
  css: ['~/assets/main.css'],
  runtimeConfig: {
    gatewayUrl: '',
    workspaceId: '',
    siteId: '',
    siteCredential: '',
    releaseId: process.env.RELEASE_ID || '',
  },
});
