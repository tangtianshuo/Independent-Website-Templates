import { previewHeaders } from '../../shared/snapshot.mjs';

export default defineEventHandler((event) => {
  if (!/^\/preview\/?$/.test(getRequestURL(event).pathname)) return;
  // The blank shell serves no draft data. Payloads arrive only from the configured parent.
  setHeader(event, 'cache-control', 'no-store');
  setHeader(event, 'x-robots-tag', 'noindex, nofollow, noarchive');
  const headers = previewHeaders(useRuntimeConfig(event).public.previewAdminOrigin);
  if (!headers) {
    setResponseStatus(event, 404);
    setHeader(event, 'content-type', 'text/plain; charset=utf-8');
    return 'Preview unavailable';
  }
  for (const [name, value] of Object.entries(headers)) setHeader(event, name, value);
});
