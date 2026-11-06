export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  let lastPage = '';
  function trackPageView(page: { siteId?: string; path?: string }, preview = false) {
    const origin = config.public.ingestOrigin;
    if (preview || !page.siteId || !page.path || !origin || page.path.startsWith('/preview'))
      return;
    const key = `${page.siteId}:${page.path}`;
    if (key === lastPage) return;
    lastPage = key;
    // Browser storage and intake are optional: neither can prevent rendering.
    try {
      const visitorKey = `site-visitor:${page.siteId}`;
      const sessionKey = `site-session:${page.siteId}`;
      const visitorId = localStorage.getItem(visitorKey) || crypto.randomUUID();
      const sessionId = sessionStorage.getItem(sessionKey) || crypto.randomUUID();
      localStorage.setItem(visitorKey, visitorId);
      sessionStorage.setItem(sessionKey, sessionId);
      void $fetch(
        `${origin.replace(/\/$/, '')}/api/v1/sites/${encodeURIComponent(page.siteId)}/events`,
        {
          method: 'POST',
          body: {
            eventId: crypto.randomUUID(),
            path: page.path,
            referrer: document.referrer || undefined,
            device: window.innerWidth < 700 ? 'mobile' : 'desktop',
            visitorId,
            sessionId,
          },
        },
      ).catch(() => undefined);
    } catch {
      /* Privacy restrictions must not break the public page. */
    }
  }
  return { provide: { trackPageView } };
});
