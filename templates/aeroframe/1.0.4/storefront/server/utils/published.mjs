import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { safePath, matches, snapshotShape, snapshotPage, normalizeContractSnapshot } from '../../shared/snapshot.mjs';
import { validatePublishedAssets } from './published-assets.mjs';
export { previewPage } from '../../shared/snapshot.mjs';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const envelopeShape = { schemaVersion: 1, workspaceId: '', siteId: '', releaseId: '', checksum: '', snapshot: snapshotShape };

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
  return value;
}

export function publishedPage(response, workspaceId, siteId, path) {
  if (!workspaceId || !siteId || !safePath(path) || !matches(response, envelopeShape)) return null;
  const { snapshot } = response;
  if (snapshot.assets !== undefined && !validatePublishedAssets(snapshot.assets, undefined, '/_assets/')) return null;
  if (!response.workspaceId || !response.siteId || !response.releaseId ||
      response.workspaceId !== workspaceId || response.siteId !== siteId ||
      snapshot.workspaceId !== workspaceId || snapshot.siteId !== siteId || !snapshot.language ||
      !/^[a-f0-9]{64}$/.test(response.checksum) ||
      createHash('sha256').update(JSON.stringify(canonical(snapshot)), 'utf8').digest('hex') !== response.checksum) return null;
  return snapshotPage(snapshot, path);
}

export async function fetchPublishedPage({ gatewayUrl, workspaceId, siteId, credential, releaseId, path, fetcher = fetch }) {
  if (!gatewayUrl || !workspaceId || !siteId || !credential || !safePath(path)) return null;
  const url = new URL(`/api/v1/sites/${encodeURIComponent(siteId)}/published-release`, gatewayUrl);
  if (releaseId) url.searchParams.set('releaseId', releaseId);
  const response = await fetcher(url, { headers: { authorization: `Bearer ${credential}` } });
  if (!response.ok) throw new Error(`Published gateway returned ${response.status}`);
  return publishedPage(await response.json(), workspaceId, siteId, path);
}

export async function readPublishedPage({ snapshotPath, workspaceId, siteId, path }) {
  if (!snapshotPath || !workspaceId || !siteId || !safePath(path)) return null;
  let response;
  try {
    response = JSON.parse(await readFile(snapshotPath, 'utf8'));
  } catch (error) {
    throw new Error(`Published snapshot unavailable: ${error.message}`);
  }
  if (response.contractVersion === 1 && !validatePublishedAssets(response.assets, response.manifestAssets, response.assetBasePath || '/_assets/')) {
    throw new Error('Published snapshot has invalid assets');
  }
  if (response.contractVersion === 1) {
    if (response.workspaceId !== workspaceId || response.siteId !== siteId) return null;
    const snapshot = normalizeContractSnapshot(response);
    return snapshot ? snapshotPage(snapshot, path) : null;
  }
  return publishedPage(response, workspaceId, siteId, path);
}
