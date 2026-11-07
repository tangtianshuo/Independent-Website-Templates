import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readPublishedPage } from "../server/utils/published.mjs";
import {
  normalizeContractSnapshot,
  snapshotPage,
} from "../shared/snapshot.mjs";

const fixture = JSON.parse(
  await readFile(
    new URL("../../contract-tests/snapshot.json", import.meta.url),
  ),
);

test("renders all five service pages from one immutable contract", () => {
  const snapshot = normalizeContractSnapshot(fixture);
  for (const [path, view] of [
    ["/", "home"],
    ["/services", "services"],
    ["/services/discovery", "service"],
    ["/team", "team"],
    ["/contact", "contact"],
  ]) {
    assert.equal(snapshotPage(snapshot, path)?.content.view, view);
  }
  assert.equal(snapshotPage(snapshot, "/unknown"), null);
});

test("keeps navigation and redirects confined to published pages", () => {
  const value = structuredClone(fixture);
  value.redirects.push({ from: "/old-services", to: "/services" });
  const snapshot = normalizeContractSnapshot(value);
  assert.equal(snapshotPage(snapshot, "/old-services").redirect, "/services");
  assert.deepEqual(
    snapshotPage(snapshot, "/")?.navigation.map((item) => item.path),
    ["/", "/services", "/team", "/contact"],
  );
  for (const to of ["//attacker.test", "/missing", "/api/published"]) {
    value.redirects[0].to = to;
    assert.equal(
      snapshotPage(normalizeContractSnapshot(value), "/old-services"),
      null,
    );
  }
});

test("authoritative published reads reject foreign identity and tampering", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "service-studio-runtime-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "snapshot.json");
  await writeFile(path, JSON.stringify(fixture));
  assert.equal(
    (
      await readPublishedPage({
        snapshotPath: path,
        workspaceId: "workspace-service",
        siteId: "site-service",
        path: "/",
      })
    )?.path,
    "/",
  );
  assert.equal(
    await readPublishedPage({
      snapshotPath: path,
      workspaceId: "workspace-service",
      siteId: "foreign-site",
      path: "/",
    }),
    null,
  );
  const tampered = structuredClone(fixture);
  tampered.pages[0].content.unknown = "private";
  await writeFile(path, JSON.stringify(tampered));
  assert.equal(
    await readPublishedPage({
      snapshotPath: path,
      workspaceId: "workspace-service",
      siteId: "site-service",
      path: "/",
    }),
    null,
  );
});
