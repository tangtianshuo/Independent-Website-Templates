import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  acceptPreviewMessage,
  previewAdminOrigin,
  previewHeaders,
  previewNavigationPath,
  previewPage,
} from "../shared/snapshot.mjs";

const fragment = JSON.parse(
  await readFile(
    new URL("../../contract-tests/snapshot.json", import.meta.url),
  ),
);

test("private preview resolves the selected team page", () => {
  const page = previewPage(fragment, "/team");
  assert.equal(page?.content.view, "team");
  assert.equal(page.content.preset.demo.hero.title, "Mina Park");
  assert.equal(page.content.preset.theme.accent, "#d4552d");
});

test("preview messages require the exact CMS parent origin", () => {
  const parent = {};
  const self = {};
  const context = {
    adminOrigin: "https://cms.example.com",
    parent,
    self,
  };
  const event = {
    origin: context.adminOrigin,
    source: parent,
    data: { type: "storefront:preview", payload: fragment, path: "/contact" },
  };
  assert.equal(acceptPreviewMessage(event, context)?.page.path, "/contact");
  assert.equal(
    acceptPreviewMessage(
      { ...event, origin: "https://cms.example.com.attacker.test" },
      context,
    ),
    null,
  );
  assert.equal(acceptPreviewMessage({ ...event, source: {} }, context), null);
});

test("preview security headers and navigation base removal are strict", () => {
  assert.equal(previewAdminOrigin("https://cms.example.com/path"), null);
  assert.deepEqual(previewHeaders("https://cms.example.com"), {
    "cache-control": "no-store",
    "x-robots-tag": "noindex, nofollow, noarchive",
    "content-security-policy": "frame-ancestors https://cms.example.com",
    "referrer-policy": "no-referrer",
  });
  const base = "/preview/service-studio/1.0.0/";
  assert.equal(previewNavigationPath(`${base}services`, base), "/services");
  assert.equal(
    previewNavigationPath(`${base}services?view=all`, base),
    "/services?view=all",
  );
  assert.equal(previewNavigationPath("//attacker.test", base), null);
});

test("preview shell announces the immutable service template identity", async () => {
  const shell = await readFile(
    new URL("../pages/preview.vue", import.meta.url),
    "utf8",
  );
  assert.match(shell, /templateId:\s*["']service-studio["']/);
  assert.match(shell, /templateVersion:\s*["']1\.0\.0["']/);
});
