import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  canonicalChecksum,
  validateManifest,
} from "../../scripts/validate.mjs";
import { runContract } from "../../contracts/runner.mjs";

const repositoryRoot = new URL("../../", import.meta.url).pathname;
const templateRoot = join(repositoryRoot, "templates/service-studio/1.0.0");
const manifestPath = join(templateRoot, "template.json");
const cmsRoot = process.env.CMS_CONTRACT_ROOT;
const gatewayRoot = process.env.GATEWAY_CONTRACT_ROOT;
const previewRoot = process.env.PREVIEW_CONTRACT_ROOT;

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

test(
  "service-studio packages and installs through the local B2 transaction",
  {
    skip: !previewRoot
      ? "Set PREVIEW_CONTRACT_ROOT for B2 verification"
      : false,
  },
  async (context) => {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const storefront = join(templateRoot, "storefront");
    execFileSync("npm", ["run", "build:preview"], {
      cwd: storefront,
      env: {
        ...process.env,
        PREVIEW_APP_BASE_URL: `/preview/${manifest.id}/${manifest.version}/`,
      },
      stdio: "pipe",
    });
    const directory = await mkdtemp(join(tmpdir(), "service-studio-b2-"));
    context.after(() => rm(directory, { recursive: true, force: true }));
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
    const bundleDir = join(directory, "bundle");
    const { buildPreviewBundle } = await import(
      pathToFileURL(join(repositoryRoot, "scripts/preview-bundle.mjs")).href
    );
    const bundle = await buildPreviewBundle({
      publicDir: join(storefront, ".output/public"),
      outputDir: bundleDir,
      templateId: manifest.id,
      templateVersion: manifest.version,
      sourceCommit,
      manifestChecksum: `sha256:${canonicalChecksum(manifest)}`,
    });
    const archivePath = join(directory, "preview-bundle.tar.gz");
    execFileSync("tar", [
      "--format=ustar",
      "-czf",
      archivePath,
      "-C",
      bundleDir,
      ".",
    ]);
    const { preparePreviewRelease } = await import(
      pathToFileURL(join(repositoryRoot, "scripts/preview-publication.mjs"))
        .href
    );
    const record = await preparePreviewRelease({
      registryRoot: join(directory, "source-registry"),
      manifest,
      sourceCommit,
      archivePath,
      async build() {
        return bundle.bundleDigest;
      },
      async push() {
        return `sha256:${createHash("sha256")
          .update(await readFile(archivePath))
          .digest("hex")}`;
      },
      async pull() {
        throw new Error("fresh local package must not pull");
      },
    });
    assert.equal(record.bundleDigest, bundle.bundleDigest);
    assert.equal(record.sourceCommit, sourceCommit);

    const { extractBundleArchive, installBundle } = await import(
      pathToFileURL(join(previewRoot, "ops/install-bundle.mjs")).href
    );
    const stagingDir = join(directory, "staging");
    await mkdir(stagingDir, { mode: 0o700 });
    await extractBundleArchive({ archivePath, stagingDir });
    const bundlesRoot = join(directory, "installed/bundles");
    const registryPath = join(directory, "installed/preview/index.json");
    await mkdir(dirname(registryPath), { recursive: true });
    const options = {
      stagingDir,
      bundlesRoot,
      record,
      registryPath,
    };
    assert.equal(await installBundle(options), "installed");
    assert.equal(await installBundle(options), "unchanged");
    const installedManifest = JSON.parse(
      await readFile(
        join(bundlesRoot, manifest.id, manifest.version, "preview-bundle.json"),
        "utf8",
      ),
    );
    assert.equal(installedManifest.bundleDigest, bundle.bundleDigest);
    assert.equal(installedManifest.sourceCommit, sourceCommit);
    const registry = JSON.parse(await readFile(registryPath, "utf8"));
    assert.deepEqual(registry.records, [record]);
    assert.match(
      await readFile(
        join(bundlesRoot, manifest.id, manifest.version, "index.html"),
        "utf8",
      ),
      /<html/i,
    );
    await writeFile(
      join(directory, "b2-record.json"),
      `${JSON.stringify(record, null, 2)}\n`,
      { mode: 0o600 },
    );
    if (process.env.E1_B2_RECORD_PATH) {
      await writeFile(
        process.env.E1_B2_RECORD_PATH,
        `${JSON.stringify(
          {
            record,
            installedBundleDigest: installedManifest.bundleDigest,
            secondInstall: "unchanged",
          },
          null,
          2,
        )}\n`,
        { mode: 0o600 },
      );
    }
  },
);
