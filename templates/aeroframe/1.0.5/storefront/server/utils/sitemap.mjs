import { readPublishedSnapshot } from './published.mjs';
import { safePath } from '../../shared/snapshot.mjs';
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
export async function readSitemap({ host, ...options }) {
  // Traffic supplies its verified canonical hostname. Never trust forwarded host headers.
  if (typeof host !== 'string' || host.length > 253 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(host) || host.split('.').some(label => label.length > 63)) throw new Error('Invalid sitemap host');
  const snapshot = await readPublishedSnapshot(options);
  if (!snapshot) throw new Error('Published sitemap snapshot unavailable');
  const paths = [...new Set(snapshot.pages.map(page => page.path))].filter(path => safePath(path) && !path.includes(':') && !path.includes('[') && !path.includes(']') && !/^\/(?:_assets|sitemap\.xml)(?:\/|$)/.test(path));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + paths.map(path => `<url><loc>${escape(`https://${host}${path}`)}</loc></url>`).join('') + '</urlset>\n';
}
