# AeroFrame 1.0.3 adoption

This is an unpublished source version. No registry record, image digest, CMS installation or active Gateway deployment is changed by this work. Versions 1.0.0–1.0.2 remain immutable.

## Release and adoption prerequisites

1. Run the manifest, unit, production build and runtime checks below. Run the Docker smoke test with a working Docker daemon before release.
2. Separately authorize and execute the existing immutable image/provenance/registry release workflow for `release/v1.0.3` or `aeroframe-v1.0.3`. This work does not execute that workflow.
3. Explicitly adopt the verified AeroFrame 1.0.3 registry record in the CMS, retaining the site's existing model and field mappings/content. Publishing the template alone does not migrate an installed site. The configured single Gateway site must then receive a new frozen CMS snapshot with the adopted 1.0.3 image digest through the normal CMS publish flow.
4. To enable matching preview, run the same 1.0.3 renderer build at the CMS-configured `VITE_TEMPLATE_PREVIEW_ORIGIN`. Set renderer `NUXT_PUBLIC_PREVIEW_ADMIN_ORIGIN` to the exact CMS admin origin, including scheme and non-default port, with no path or trailing slash (for example `http://localhost:5173`). Preview is unavailable (404) when this value is absent or invalid. The preview adapter rejects snapshots for any template identity/version other than AeroFrame 1.0.3. Do not claim matching preview for an installed older template/version or a different renderer build.
5. The CMS must fetch `/storefront/site-preview` through its authenticated SDK and pass the response from the embedding parent. Preview media must retain the private, short-lived CMS media capabilities already provided by that endpoint. The iframe does not fetch draft content, store snapshots, or make draft media public. A preview-only renderer requires no Gateway credential; published mode retains the existing server-only Gateway configuration.

Published mode uses `NUXT_GATEWAY_URL`, `NUXT_WORKSPACE_ID`, `NUXT_SITE_ID`, `NUXT_SITE_CREDENTIAL`, and optionally `NUXT_RELEASE_ID` / `RELEASE_ID`. Those credentials never enter the browser payload. The preview admin origin is intentionally public configuration, not a credential.

## Existing CMS iframe protocol

Embed `<renderer-origin>/preview`. The renderer emits this to the configured parent origin after mounting:

```js
{ type: 'storefront:preview-ready', templateId: 'aeroframe', templateVersion: '1.0.3' }
```

CMS verifies the exact iframe origin/source and these renderer identity fields before sending any draft. The old built-in display preview continues to use its separate `VITE_STOREFRONT_ORIGIN`. The CMS parent sends the authenticated site-preview result, targeting the exact renderer origin:

```js
iframe.contentWindow.postMessage({
  type: 'storefront:preview',
  payload: { kind: 'preset-site', siteName: 'Optional display name', ...releaseSnapshot },
  path: '/catalog', // optional; defaults to / or the first snapshot page
}, rendererOrigin)
```

A raw schema-v1 CMS ReleaseSnapshot is also accepted as `payload`. The alternative `{type:'cms:preview', snapshot: releaseSnapshot, path?: '/'}` envelope is accepted. CMS workspace/site/page/entry IDs may exist only in this private browser payload; the rendered page projection drops them. The existing authenticated site-preview wrapper uses `kind: 'preset-site'`, never `site-preview`.

Only messages whose `origin` exactly matches the configured CMS origin and whose `source` is the actual embedding `window.parent` are accepted. The renderer sends no drafts back. The preview shell has `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow, noarchive`, a robots meta tag, `Referrer-Policy: no-referrer` and `frame-ancestors <CMS origin>`. No public draft API is introduced. The shell itself contains no draft data and performs no published Gateway lookup.

Internal link clicks navigate within the received snapshot, including same-snapshot redirects, while the iframe URL stays `/preview`. Unknown pages display an explicit status. Payloads remain only in component memory and expire ten minutes after the last accepted message; refreshing from the CMS supplies a new private snapshot and media capabilities. The parent must be an authenticated CMS page under the trusted origin; origin trust is not a substitute for the CMS's authentication/authorization.

## Supported behavior and limits

- Explicit allowed views are `home`, `collection`, `product`, `page`, independent of URL. Paths still reject API/runtime/preview reservations, duplicates, traversal and malformed values. Published mode retains checksum and bound workspace/site validation; preview uses the same snapshot validation and projection.
- Section arrays preserve order and allow only these keys: home `hero`, `feature`; collection `heading`, `grid`; product `gallery`, `information`, `description`; page `story`. Repeated or unknown keys fail closed. `feature` remains one composite group, so its internal fleet/solutions/story/FAQ/contact order is fixed. Product description is a separate grid row. Arbitrary new blocks and rich HTML rendering are unsupported.
- Theme uses validated six-digit hex background, foreground, accent and muted colors, plus a safe font-family string. It controls the site surface/text, primary buttons, muted panels and font. Some decorative colors, image overlays and header treatments remain fixed. Font files are not downloaded; browser-installed/fallback fonts are used.
- Hero/company actions choose the first snapshot page with the corresponding explicit view. Navigation and cards link only to snapshot pages. Multiple collection pages are supported, but selecting a distinct primary collection is not configurable.
- The version does not add commerce, arbitrary layouts, rich-text editing, site provisioning, a server-side draft cache or a draft sharing URL. Existing CMS buildRelease semantics determine the actual published text/media.

## Verification

```sh
# repository root (Node 22)
npm ci
npm run validate
node --test test/validate.test.mjs test/release-version.test.mjs test/publish.test.mjs
# template storefront
cd templates/aeroframe/1.0.3/storefront
npm ci
npm test
npm run build
# repository root after build
npm run test:runtime
# Requires Docker; performs local build/container smoke test only
TEMPLATE_VERSION=1.0.3 node --test test/image.test.mjs
```


Local verification on 2026-10-28: 15 template unit tests, 29 repository unit tests, all four versioned manifests, the Nuxt production build and the built Node runtime integration passed. `git diff --exit-code HEAD -- templates/aeroframe/1.0.0 templates/aeroframe/1.0.1 templates/aeroframe/1.0.2` confirmed the published directories are unchanged. The root `npm test` completed with 29 passes, one intentionally gated runtime test skip and one Docker smoke-test failure because the local Docker daemon socket was unavailable; `npm run test:runtime` was then executed separately and passed. A live CMS/browser round-trip and a Docker image build remain adoption/release checks, not verified outcomes here.
