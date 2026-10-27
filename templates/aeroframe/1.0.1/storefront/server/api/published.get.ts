import { fetchPublishedPage } from '../utils/published.mjs';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const path = getQuery(event).path;
  if (typeof path !== 'string') throw createError({ statusCode: 404 });
  const page = await fetchPublishedPage({
    gatewayUrl: config.gatewayUrl,
    workspaceId: config.workspaceId,
    siteId: config.siteId,
    credential: config.siteCredential,
    releaseId: config.releaseId || process.env.RELEASE_ID,
    path,
  });
  if (!page) throw createError({ statusCode: 404 });
  setHeader(event, 'cache-control', 'no-store');
  return page;
});
