import { readPublishedAsset } from '../../utils/published-assets.mjs';
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event); const path = getRouterParam(event, 'path'); const snapshotPath = config.publishedSnapshotPath || process.env.PUBLISHED_SNAPSHOT_PATH;
  if (!snapshotPath || typeof path !== 'string') throw createError({ statusCode: 404 });
  const asset = await readPublishedAsset({ snapshotPath, path }); if (!asset) throw createError({ statusCode: 404 });
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable'); setHeader(event, 'content-type', asset.mimeType); setHeader(event, 'etag', asset.checksum); return asset.bytes;
});
