<script setup lang="ts">
const route = useRoute();
const path = computed(() => route.path);
const { data: page, error } = await useFetch('/api/published', { query: { path }, key: `published:${path.value}` });
if (error.value || !page.value) throw createError({ statusCode: 404, statusMessage: 'Not found' });
if ('redirect' in page.value) await navigateTo(page.value.redirect, { redirectCode: 308, replace: true });
</script>

<template><AeroPage v-if="page && !('redirect' in page)" :page="page" /></template>
