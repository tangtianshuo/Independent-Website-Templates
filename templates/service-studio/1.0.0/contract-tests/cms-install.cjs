const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");

const requireCms = createRequire(process.cwd() + "/package.json");
const { buildRelease } = requireCms("./backend/src/presets/releases");
const { createPageDraft, pageDraft, updatePageDraft } = requireCms(
  "./backend/src/presets/pages",
);
const { importPreset } = requireCms("./backend/src/presets/import");
const { canonicalJson, normalizePublicManifest } = requireCms(
  "./backend/src/presets/registry",
);
const { projectReleaseSnapshot } = requireCms(
  "./backend/src/release-contract/project",
);

const raw = JSON.parse(
  readFileSync(process.env.SERVICE_STUDIO_MANIFEST, "utf8"),
);
const manifestChecksum = `sha256:${createHash("sha256")
  .update(canonicalJson(raw), "utf8")
  .digest("hex")}`;
const record = {
  schemaVersion: 1,
  id: raw.id,
  version: raw.version,
  manifestChecksum,
  imageRepository:
    "ghcr.io/tangtianshuo/independent-website-templates/service-studio",
  imageDigest: `sha256:${"2".repeat(64)}`,
  sourceCommit: "3".repeat(40),
  manifestPath: `templates/${raw.id}/${raw.version}/template.json`,
  status: "available",
};
const manifest = normalizePublicManifest(raw, record);
const selected = {
  ...record,
  manifest,
  manifestSnapshot: raw,
};

class MemorySource {
  constructor() {
    this.site = null;
    this.templates = [];
    this.entries = [];
  }

  async findSite() {
    return this.site;
  }

  async addSite(site) {
    this.site = site;
    return site;
  }

  async claimSite(site, expectedUpdatedAt) {
    if (!this.site || this.site.updatedAt !== expectedUpdatedAt) return false;
    this.site = site;
    return true;
  }

  async updateSite(site) {
    this.site = site;
    return site;
  }

  async findTemplate(name) {
    return this.templates.find((template) => template.name === name) || null;
  }

  async addTemplate(template) {
    this.templates.push(template);
    return template;
  }

  async updateTemplate(template) {
    const index = this.templates.findIndex((item) => item._id === template._id);
    if (index === -1) throw new Error("Template missing");
    this.templates[index] = template;
    return template;
  }

  async findEntry(id) {
    return this.entries.find((entry) => entry._id === id) || null;
  }

  async addEntry(entry) {
    this.entries.push(entry);
    return entry;
  }

  async ensureEnglish() {}
}

function configure(site, key, seoDescription, sectionConfigs) {
  const page = pageDraft(site, key);
  if (!page) throw new Error(`Page ${key} is unavailable`);
  return updatePageDraft(
    site,
    key,
    {
      ...page,
      seoTitle: page.title,
      seoDescription,
      sections: sectionConfigs.map((section) => section.type),
      sectionConfigs,
      entryId: "",
    },
    null,
  );
}

function setEntryField(site, entry, fieldKey, value) {
  const model = site.models.find(
    (item) => item.templateId === entry.templateId,
  );
  const field = model?.fields.find((item) => item.key === fieldKey);
  const meta = entry.meta.find((item) => item.lng === "en");
  const prop = meta?.props.find((item) => item.id === field?.propId);
  if (!field || !prop) throw new Error(`Missing field ${fieldKey}`);
  prop.data = [value];
}

(async () => {
  const source = new MemorySource();
  let site = await importPreset(
    {
      presetId: raw.id,
      presetVersion: raw.version,
      siteName: "Clearline Studio",
      includeDemo: true,
    },
    source,
    selected,
  );
  assert.equal(site.status, "ready");
  assert.deepEqual(site.models.map((model) => model.key).sort(), [
    "service",
    "site-settings",
    "team-member",
  ]);
  assert.equal(
    site.models.some((model) => model.key === "product"),
    false,
  );
  site = configure(site, "home", "Clearline digital discovery.", [
    {
      type: "hero",
      enabled: true,
      data: {
        title: "Digital discovery",
        subtitle: "Understand the opportunity before committing to delivery.",
      },
    },
    {
      type: "service-list",
      enabled: true,
      data: { heading: "A clearer path forward" },
    },
  ]);
  site = configure(site, "services", "Professional service offerings.", [
    {
      type: "service-list",
      enabled: true,
      data: { heading: "Services", intro: "Focused work with clear scope." },
    },
  ]);
  site = configure(
    site,
    "service-detail",
    "A focused digital discovery engagement.",
    [
      {
        type: "hero",
        enabled: true,
        data: { title: "Digital discovery" },
      },
      {
        type: "service-list",
        enabled: true,
        data: { heading: "How it works" },
      },
    ],
  );
  site = configure(site, "team", "Meet the Clearline team.", [
    {
      type: "team-grid",
      enabled: true,
      data: { heading: "The people behind the work" },
    },
  ]);
  site = configure(site, "contact", "Start a conversation with Clearline.", [
    {
      type: "contact-form",
      enabled: true,
      data: {
        heading: "Tell us what is changing",
        email: "hello@clearline.example",
      },
    },
  ]);
  site.navigation = [
    { id: "nav-home", label: "Home", href: "/", enabled: true, children: [] },
    {
      id: "nav-services",
      label: "Services",
      href: "/services",
      enabled: true,
      children: [],
    },
    {
      id: "nav-team",
      label: "Team",
      href: "/team",
      enabled: true,
      children: [],
    },
    {
      id: "nav-contact",
      label: "Contact",
      href: "/contact",
      enabled: true,
      children: [],
    },
  ];
  site.operations = {
    seoTitle: "Clearline Studio",
    seoDescription: "Strategy and service design.",
    contactFormEnabled: true,
  };
  const stage = process.env.SERVICE_STUDIO_STAGE || "initial";
  if (stage === "updated") {
    const service = source.entries.find(
      (entry) =>
        entry.templateId ===
        site.models.find((model) => model.key === "service").templateId,
    );
    const team = source.entries.find(
      (entry) =>
        entry.templateId ===
        site.models.find((model) => model.key === "team-member").templateId,
    );
    setEntryField(site, service, "title", "Strategy sprint");
    setEntryField(site, service, "summary", {
      nodes: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "A second published service update with a clear decision checkpoint.",
            },
          ],
        },
      ],
    });
    setEntryField(site, team, "name", "Mina Park, updated");
    setEntryField(site, team, "role", "Delivery practice lead");
    const blueprint = pageDraft(site, "service-detail");
    site = createPageDraft(
      site,
      "service-strategy",
      {
        ...blueprint,
        title: "Strategy sprint",
        path: "/services/strategy",
        blueprintKey: "service-detail",
        seoTitle: "Strategy sprint",
        seoDescription: "A focused strategy sprint.",
        entryId: service._id,
        sectionConfigs: [
          {
            type: "hero",
            enabled: true,
            data: {
              title: "Strategy sprint",
              subtitle: "A clear decision checkpoint.",
            },
          },
          {
            type: "service-list",
            enabled: true,
            data: { heading: "One week, one decision" },
          },
        ],
      },
      service,
    );
    site.navigation = site.navigation.map((node) =>
      node.id === "nav-services"
        ? {
            ...node,
            children: [
              {
                id: "nav-strategy",
                label: "Strategy sprint",
                href: "/services/strategy",
                enabled: true,
                children: [],
              },
            ],
          }
        : node,
    );
  }
  source.site = site;

  const input = {
    site,
    templates: source.templates,
    entries: source.entries,
    media: [],
    language: "en",
    mediaOrigin: "https://cms.example",
    currency: "USD",
  };
  const release = JSON.parse(JSON.stringify(buildRelease(input)));
  const projected = projectReleaseSnapshot(release);
  const preview = Object.fromEntries(
    release.pages.map((page) => [
      page.content.view,
      {
        path: page.path,
        view: page.content.view,
        sections: page.content.sections,
      },
    ]),
  );
  process.stdout.write(
    JSON.stringify({
      stage,
      siteId: site._id,
      workspaceId: site.workspaceId,
      models: site.models.map((model) => model.key).sort(),
      releasePages: release.pages.map((page) => page.path),
      preview,
      checksum: projected.checksum,
      snapshot: projected.snapshot,
    }),
  );
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
