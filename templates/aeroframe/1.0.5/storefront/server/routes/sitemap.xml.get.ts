import { readSitemap } from '../utils/sitemap.mjs';
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const snapshotPath = config.publishedSnapshotPath || process.env.PUBLISHED_SNAPSHOT_PATH;
  if (!snapshotPath) throw createError({ statusCode: 503, statusMessage: 'Published runtime snapshot is unavailable' });
  const xml = await readSitemap({ snapshotPath, workspaceId: config.workspaceId, siteId: config.siteId, host: getHeader(event, 'host') });
  setHeader(event, 'content-type', 'application/xml; charset=utf-8');
  setHeader(event, 'cache-control', 'no-store');
  return xml;
});
