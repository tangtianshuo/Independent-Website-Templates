<script setup lang="ts">
import { acceptPreviewMessage, previewAdminOrigin, previewPage } from '#shared/snapshot.mjs';

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
  if (adminOrigin && window.parent !== window) window.parent.postMessage({ type: 'storefront:preview-ready', templateId: 'aeroframe', templateVersion: '1.0.3' }, adminOrigin);
});
onBeforeUnmount(() => { window.removeEventListener('message', receive); clearTimeout(expires); });
useHead({ title: 'Private CMS preview', meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive' }] });
</script>

<template>
  <div>
    <p v-if="status" role="status">{{ status }}</p>
    <AeroPage v-if="page" :page="page" preview @navigate="navigate" />
  </div>
</template>
