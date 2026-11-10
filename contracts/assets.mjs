import { createHash } from 'node:crypto';

export function isPublishedAssetUrl(url, basePath = '/_assets/') {
  return typeof url === 'string' && typeof basePath === 'string' && basePath.startsWith('/') && url.startsWith(basePath) && !url.includes('..');
}

export function validatePublishedAssets(assets, manifestAssets, basePath) {
  if (!Array.isArray(assets)) return false;
  if (manifestAssets !== undefined && !Array.isArray(manifestAssets)) return false;
  const known = manifestAssets === undefined ? null : new Set(manifestAssets.map(({ path }) => path));
  const paths = new Set();
  for (const asset of assets) {
    if (!asset || typeof asset.path !== 'string' || !asset.path || asset.path.startsWith('/') || asset.path.includes('..') || paths.has(asset.path) || known && !known.has(asset.path) ||
        typeof asset.checksum !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(asset.checksum) ||
        asset.url !== undefined && !isPublishedAssetUrl(asset.url, basePath) ||
        asset.contentBase64 !== undefined && (typeof asset.contentBase64 !== 'string' || !asset.contentBase64)) return false;
    if (asset.contentBase64 !== undefined) {
      const bytes = Buffer.from(asset.contentBase64, 'base64');
      if (!bytes.length || bytes.toString('base64') !== asset.contentBase64 || `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== asset.checksum) return false;
    }
    paths.add(asset.path);
  }
  return true;
}
