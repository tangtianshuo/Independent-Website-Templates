# fireguard 1.0.2 adoption

This source version declares editor/renderer contracts and preserves every older
version directory unchanged. A local build is provisional until its exact source
commit, manifest checksum, image digest and preview bundle are registered through
the existing release process. No registry publication is performed here.

## Public runtime

Build with `npm ci && npm run build` in `storefront/`. Mount the immutable
ContractSnapshotV1 JSON read-only, set `PUBLISHED_SNAPSHOT_PATH`,
`NUXT_WORKSPACE_ID` and `NUXT_SITE_ID`, and run `.output/server/index.mjs`.
Public page and asset routes read the local artifact. Missing or invalid artifacts
fail closed without contacting CMS or Gateway. `NUXT_PUBLIC_INGEST_ORIGIN` is a
public ingest origin where the renderer supports the contact form.

## Private preview

Build with `PREVIEW_APP_BASE_URL=/templates/fireguard/1.0.2/`
and `NUXT_PUBLIC_PREVIEW_ADMIN_ORIGIN=<exact CMS origin>` using
`npm run build:preview`. Serve `.output/public` below that versioned base URL.
The blank preview shell announces `fireguard@1.0.2` and accepts drafts only from its
configured embedding parent. The preview delivery service must provide private
cache and framing headers for static files; Nuxt runtime middleware handles these
headers when the preview is served by the Node runtime.

## Section data

Page-bound model fields remain the default content. Declared section properties
are optional typed overrides: hero title/image, feature eyebrow, collection
heading, catalog columns, product image/title/price/description and page story.
A layout document takes precedence over section configs; disabled sections are
omitted and enabled section order is preserved. Catalog columns default to three
when the grid has section configuration without an explicit columns value.
Unknown sections, properties, mismatched identities and unsafe values fail closed.
Older versions retain their original runtime and tests.
