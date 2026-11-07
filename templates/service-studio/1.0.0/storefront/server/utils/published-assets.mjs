import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
function validatePublishedAssets(assets, manifestAssets, basePath = '/_assets/') {
  if (!Array.isArray(assets) || manifestAssets !== undefined && !Array.isArray(manifestAssets)) return false;
  const known = manifestAssets === undefined ? null : new Set(manifestAssets.map(({ path }) => path)); const paths = new Set();
  for (const asset of assets) {
    if (!asset || typeof asset.path !== 'string' || !asset.path || asset.path.startsWith('/') || asset.path.includes('..') || paths.has(asset.path) || known && !known.has(asset.path) || typeof asset.checksum !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(asset.checksum) || asset.url !== undefined && (typeof asset.url !== 'string' || !asset.url.startsWith(basePath) || asset.url.includes('..'))) return false;
    if (asset.contentBase64 !== undefined) { const bytes = Buffer.from(asset.contentBase64, 'base64'); if (!bytes.length || bytes.toString('base64') !== asset.contentBase64 || `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== asset.checksum) return false; }
    paths.add(asset.path);
  }
  return true;
}
export { validatePublishedAssets };
const safeAssetPath = (path) => typeof path === 'string' && path && !path.startsWith('/') && !path.includes('..') && !path.includes('\\') && !/[?#\x00-\x1f\x7f]/.test(path);
export async function readPublishedAsset({ snapshotPath, path }) {
  if (!snapshotPath || !safeAssetPath(path)) return null;
  let response; try { response = JSON.parse(await readFile(snapshotPath, 'utf8')); } catch (error) { throw new Error(`Published snapshot unavailable: ${error.message}`); }
  if (response.contractVersion !== 1 || !validatePublishedAssets(response.assets, response.manifestAssets, response.assetBasePath || '/_assets/')) throw new Error('Published snapshot has invalid assets');
  const asset = response.assets.find((item) => item.path === path); if (!asset || typeof asset.contentBase64 !== 'string') return null;
  const bytes = Buffer.from(asset.contentBase64, 'base64'); if (!bytes.length || bytes.toString('base64') !== asset.contentBase64 || `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== asset.checksum) throw new Error('Published asset checksum mismatch');
  return { bytes, mimeType: asset.mimeType, checksum: asset.checksum };
}
