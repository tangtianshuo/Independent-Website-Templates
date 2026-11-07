import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { validateManifest } from "../../scripts/validate.mjs";
import { runContract } from "../../contracts/runner.mjs";

const repositoryRoot = new URL("../../", import.meta.url).pathname;
const templateRoot = join(repositoryRoot, "templates/service-studio/1.0.0");
const manifestPath = join(templateRoot, "template.json");
const cmsRoot = process.env.CMS_CONTRACT_ROOT;
const gatewayRoot = process.env.GATEWAY_CONTRACT_ROOT;

test("service-studio validates without a commerce model", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await validateManifest(manifest, templateRoot);
  assert.equal(manifest.id, "service-studio");
  assert.equal(manifest.version, "1.0.0");
  assert.deepEqual(manifest.models.map(({ key }) => key).sort(), [
    "service",
    "site-settings",
    "team-member",
  ]);
  assert.equal(
    manifest.models.some(({ key }) => key === "product"),
    false,
  );
  assert.deepEqual(manifest.pages.map(({ path }) => path).sort(), [
    "/",
    "/contact",
    "/services",
    "/services/:slug",
    "/team",
  ]);
  assert.deepEqual(manifest.editor.sections.map(({ type }) => type).sort(), [
    "contact-form",
    "hero",
    "service-list",
    "team-grid",
  ]);
});

test(
  "service-studio projects through the real CMS installation API",
  {
    skip: !cmsRoot
      ? "Set CMS_CONTRACT_ROOT for CMS installation verification"
      : false,
  },
  async () => {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "-r",
          "ts-node/register",
          "-r",
          "tsconfig-paths/register",
          join(templateRoot, "contract-tests/cms-install.cjs"),
        ],
        {
          cwd: cmsRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            TS_NODE_PROJECT: "backend/tsconfig.json",
            TS_NODE_TRANSPILE_ONLY: "1",
            SERVICE_STUDIO_MANIFEST: manifestPath,
          },
        },
      ),
    );
    assert.deepEqual(result.models, [
      "service",
      "site-settings",
      "team-member",
    ]);
    assert.equal(result.models.includes("product"), false);
    const expectedPages = [
      "/",
      "/contact",
      "/services",
      "/services/discovery",
      "/team",
    ];
    if (process.env.SERVICE_STUDIO_STAGE === "updated") {
      expectedPages.push("/services/strategy");
    }
    assert.deepEqual(result.releasePages.sort(), expectedPages.sort());
    assert.equal(result.preview.home.view, "home");
    assert.equal(result.preview.team.view, "team");
    assert.equal(result.preview.contact.view, "contact");
    if (gatewayRoot) {
      const gateway = await import(
        pathToFileURL(join(gatewayRoot, "packages/contracts/src/release.ts"))
          .href
      );
      const contract = gateway.validateContractSnapshotV1(result.snapshot);
      const bytes = Buffer.from(gateway.canonicalJson(contract));
      const validated = gateway.validateReleaseInput(
        {
          siteId: result.siteId,
          releaseId: "service-contract",
          checksum: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
          metadata: {
            templateId: "service-studio",
            templateVersion: "1.0.0",
            manifestChecksum: `sha256:${"1".repeat(64)}`,
            imageDigest: `sha256:${"2".repeat(64)}`,
          },
          snapshot: bytes.toString("base64"),
        },
        ["service-studio"],
      );
      assert.equal(validated.metadata.templateVersion, "1.0.0");
    }
  },
);

test("service-studio renders its five pages from ContractSnapshotV1", async () => {
  const fixture = JSON.parse(
    await readFile(join(templateRoot, "contract-tests/snapshot.json"), "utf8"),
  );
  await runContract({ snapshot: fixture, templateRoot });
  const shared = await import(
    pathToFileURL(join(templateRoot, "storefront/shared/snapshot.mjs")).href
  );
  const snapshot = shared.normalizeContractSnapshot(fixture);
  assert.ok(snapshot);
  const home = shared.snapshotPage(snapshot, "/");
  const services = shared.snapshotPage(snapshot, "/services");
  const detail = shared.snapshotPage(snapshot, "/services/discovery");
  const team = shared.snapshotPage(snapshot, "/team");
  const contact = shared.snapshotPage(snapshot, "/contact");
  assert.equal(home.content.view, "home");
  assert.equal(home.content.preset.demo.brand, "Clearline Studio");
  assert.equal(services.content.view, "services");
  assert.equal(detail.content.view, "service");
  assert.equal(
    detail.content.preset.demo.hero.image,
    "/_assets/media/service/cover.png",
  );
  assert.equal(team.content.view, "team");
  assert.equal(contact.content.view, "contact");
  assert.match(JSON.stringify(home), /clearline-swapcard-offer-marker/);
  assert.match(JSON.stringify(team), /Mina Park/);
  assert.match(JSON.stringify(contact), /clearline-contact-marker/);
});
