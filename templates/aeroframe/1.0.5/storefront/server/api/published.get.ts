import { readPublishedPage } from '../utils/published.mjs';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const path = getQuery(event).path;
  if (typeof path !== 'string') throw createError({ statusCode: 404 });
  const snapshotPath = config.publishedSnapshotPath || process.env.PUBLISHED_SNAPSHOT_PATH;
  if (!snapshotPath) throw createError({ statusCode: 503, statusMessage: 'Published runtime snapshot is unavailable' });
  const page = await readPublishedPage({
    snapshotPath,
    workspaceId: config.workspaceId,
    siteId: config.siteId,
    path,
  });
  if (!page) throw createError({ statusCode: 404 });
  setHeader(event, 'cache-control', 'no-store');
  return page;
});
