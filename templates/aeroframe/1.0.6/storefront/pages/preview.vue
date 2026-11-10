<script setup lang="ts">
import { acceptPreviewMessage, acceptPreviewOriginMessage, previewAdminOrigin, previewPage } from '#preview-shared/snapshot.mjs';

const adminOrigin = ref(previewAdminOrigin(useRuntimeConfig().public.previewAdminOrigin));
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
const selectionRoot = ref<HTMLElement>();
function currentPage() { return snapshot.value?.pages?.find((item: any) => item.path === page.value?.path); }
function selectionNodes() { const current = currentPage(); return (current?.layoutDocument || current?.content?.layoutDocument)?.root || []; }
function highlight(type: string, scroll = false) {
  for (const element of selectionRoot.value?.querySelectorAll<HTMLElement>('[data-section-type]') || []) {
    const selected = element.dataset.sectionType === type;
    element.toggleAttribute('data-studio-selected', selected);
    if (selected && scroll) element.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
}
function selectSection(event: MouseEvent) {
  const element = (event.target as Element)?.closest('[data-section-type]') as HTMLElement | null;
  const node = selectionNodes().find((item: any) => item.enabled && item.type === element?.dataset.sectionType);
  const current = currentPage();
  if (!node || !current || !adminOrigin.value || window.parent === window) return;
  highlight(node.type);
  window.parent.postMessage({ type: 'studio:node-selected', protocolVersion: 1, templateId: 'aeroframe', templateVersion: '1.0.6', pageKey: current.pageKey, nodeId: node.id, nodeType: node.type }, adminOrigin.value);
}
function receive(event: MessageEvent) {
  const data = event.data;
  if (!adminOrigin.value) {
    const origin = acceptPreviewOriginMessage(event, {
      parent: window.parent,
      self: window,
      expected: { id: 'aeroframe', version: '1.0.6' },
    });
    if (origin) {
      adminOrigin.value = origin;
      window.parent.postMessage({ type: 'storefront:preview-ready', protocolVersion: 1, templateId: 'aeroframe', templateVersion: '1.0.6' }, origin);
    }
    return;
  }
  if (event.origin === adminOrigin.value && event.source === window.parent && window.parent !== window && data?.type === 'studio:select-node') {
    if (data.protocolVersion !== 1 || data.templateId !== 'aeroframe' || data.templateVersion !== '1.0.6' || data.pageKey !== currentPage()?.pageKey || typeof data.nodeId !== 'string' || typeof data.nodeType !== 'string') return;
    const node = selectionNodes().find((item: any) => item.id === data.nodeId && item.type === data.nodeType && item.enabled);
    if (node) highlight(node.type, true);
    return;
  }
  const accepted = acceptPreviewMessage(event, { adminOrigin: adminOrigin.value, parent: window.parent, self: window });
  if (!accepted) return;
  snapshot.value = accepted.snapshot;
  navigate(accepted.path);
  clearTimeout(expires);
  expires = setTimeout(() => { snapshot.value = null; page.value = null; status.value = 'Preview expired. Refresh it from the CMS.'; }, 10 * 60 * 1000);
}
onMounted(() => {
  window.addEventListener('message', receive);
  if (window.parent !== window) {
    if (adminOrigin.value)
      window.parent.postMessage({ type: 'storefront:preview-ready', protocolVersion: 1, templateId: 'aeroframe', templateVersion: '1.0.6' }, adminOrigin.value);
    else
      window.parent.postMessage({ type: 'storefront:preview-needs-origin', protocolVersion: 1, templateId: 'aeroframe', templateVersion: '1.0.6' }, '*');
  }
});
onBeforeUnmount(() => { window.removeEventListener('message', receive); clearTimeout(expires); });
useHead({ title: 'Private CMS preview', meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive' }] });
</script>

<template>
  <div ref="selectionRoot" @click.capture="selectSection">
    <p v-if="status" role="status">{{ status }}</p>
    <AeroPage v-if="page" :page="page" preview @navigate="navigate" />
  </div>
</template>

<style scoped>
:deep([data-studio-selected]) { outline: 2px solid #2563eb; outline-offset: -2px; }
</style>
