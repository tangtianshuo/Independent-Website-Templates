const templateId = "service-studio";
const templateVersion = "1.0.0";
const route = /^\/(?:[^/?#\\%\x00-\x1f\x7f]+(?:\/[^/?#\\%\x00-\x1f\x7f]+)*)?$/;
const allowedViews = new Set([
  "home",
  "services",
  "service",
  "team",
  "contact",
]);
const sectionOptions = {
  home: ["hero", "service-list"],
  services: ["service-list"],
  service: ["hero", "service-list"],
  team: ["team-grid"],
  contact: ["contact-form"],
};
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const string = (value) => typeof value === "string";

export const safePath = (path) =>
  string(path) &&
  route.test(path) &&
  !/^\/(?:api|_nuxt|__nuxt_error|healthz|preview)(?:\/|$)/i.test(path) &&
  path.split("/").every((segment) => segment !== "." && segment !== "..");

export const snapshotShape = {
  schemaVersion: 1,
  workspaceId: "",
  siteId: "",
  language: "",
  contractVersion: 1,
  template: { id: "", version: "" },
  pages: [],
  navigation: [],
  redirects: [],
  assets: [],
};

export function matches(value, shape) {
  if (Array.isArray(shape)) {
    return (
      Array.isArray(value) && value.every((item) => matches(item, shape[0]))
    );
  }
  if (object(shape)) {
    if (!object(value)) return false;
    return Object.entries(shape).every(([key, child]) =>
      matches(value[key], child),
    );
  }
  if (shape === "") return string(value);
  return value === shape;
}

function safeTheme(theme) {
  return (
    object(theme) &&
    ["background", "foreground", "accent", "muted"].every((key) =>
      /^#[a-f0-9]{6}$/i.test(theme[key]),
    ) &&
    /^[a-z0-9 ,"'-]{1,120}$/i.test(theme.font)
  );
}

function normalizeNavigation(nodes, ids = new Set()) {
  if (!Array.isArray(nodes)) throw new Error("Invalid navigation");
  return nodes.flatMap((node) => {
    if (
      !object(node) ||
      !string(node.id) ||
      !node.id ||
      ids.has(node.id) ||
      !string(node.label) ||
      typeof node.enabled !== "boolean" ||
      !Array.isArray(node.children)
    ) {
      throw new Error("Invalid navigation");
    }
    ids.add(node.id);
    if (
      node.path !== undefined &&
      node.href !== undefined &&
      node.path !== node.href
    ) {
      throw new Error("Invalid navigation");
    }
    const children = normalizeNavigation(node.children, ids);
    const path = node.href ?? node.path;
    if (path !== undefined && !safePath(path)) {
      throw new Error("Invalid navigation");
    }
    return node.enabled
      ? [...(path ? [{ label: node.label, path }] : []), ...children]
      : [];
  });
}

export function normalizeContractSnapshot(snapshot) {
  if (
    !object(snapshot) ||
    snapshot.contractVersion !== 1 ||
    snapshot.template?.id !== templateId ||
    snapshot.template?.version !== templateVersion ||
    !string(snapshot.workspaceId) ||
    !snapshot.workspaceId ||
    !string(snapshot.siteId) ||
    !snapshot.siteId ||
    !string(snapshot.language) ||
    !snapshot.language ||
    !Array.isArray(snapshot.pages) ||
    !Array.isArray(snapshot.assets)
  ) {
    return null;
  }
  const keys = [
    "contractVersion",
    "schemaVersion",
    "workspaceId",
    "siteId",
    "language",
    "template",
    "pages",
    "navigation",
    "redirects",
    "operations",
    "assets",
  ];
  const pageKeys = ["path", "pageKey", "entryId", "content", "layoutDocument"];
  const contentKeys = [
    "kind",
    "view",
    "preset",
    "sections",
    "sectionConfigs",
    "layoutDocument",
    "seo",
    "operations",
    "items",
  ];
  const presetKeys = [
    "id",
    "version",
    "name",
    "description",
    "theme",
    "demo",
    "showcase",
  ];
  const demoKeys = [
    "brand",
    "contactEmail",
    "hero",
    "page",
    "product",
    "collection",
  ];
  if (
    Object.keys(snapshot).some((key) => !keys.includes(key)) ||
    snapshot.pages.some(
      (page) =>
        Object.keys(page).some((key) => !pageKeys.includes(key)) ||
        page?.content?.preset?.id !== templateId ||
        page?.content?.preset?.version !== templateVersion ||
        Object.keys(page.content).some((key) => !contentKeys.includes(key)) ||
        Object.keys(page.content.preset).some(
          (key) => !presetKeys.includes(key),
        ) ||
        Object.keys(page.content.preset.demo ?? {}).some(
          (key) => !demoKeys.includes(key),
        ),
    )
  ) {
    return null;
  }
  try {
    return {
      ...snapshot,
      navigation: normalizeNavigation(snapshot.navigation),
    };
  } catch {
    return null;
  }
}

function richText(value) {
  if (string(value)) return value;
  if (Array.isArray(value))
    return value.map(richText).filter(Boolean).join(" ");
  if (object(value)) {
    if (string(value.text)) return value.text;
    return richText(value.content ?? value.nodes);
  }
  return "";
}

function imageValue(value) {
  if (typeof value !== "string" || !value) return "";
  if (/^https?:\/\//.test(value) || /^\/(?!\/)/.test(value)) return value;
  return "";
}

function sectionValues(page, snapshot) {
  const layout = page.layoutDocument ?? page.content.layoutDocument;
  const values = structuredClone(
    layout
      ? layout.root.map((node) => ({
          id: node.id,
          type: node.type,
          enabled: node.enabled,
          data: node.props,
        }))
      : (page.content.sectionConfigs ?? []),
  );
  if (!Array.isArray(values)) return null;
  const seen = new Set();
  const preset = structuredClone(page.content.preset);
  preset.theme = siteTheme(preset.theme);
  preset.demo = {
    brand: string(preset.demo?.brand) ? preset.demo.brand : snapshot.siteId,
    contactEmail: string(preset.demo?.contactEmail)
      ? preset.demo.contactEmail
      : "",
    hero: {
      title: string(preset.demo?.hero?.title) ? preset.demo.hero.title : "",
      subtitle: string(preset.demo?.hero?.subtitle)
        ? preset.demo.hero.subtitle
        : "",
      image: imageValue(preset.demo?.hero?.image),
    },
    page: {
      title: string(preset.demo?.page?.title) ? preset.demo.page.title : "",
      body: string(preset.demo?.page?.body) ? preset.demo.page.body : "",
      image: imageValue(preset.demo?.page?.image),
    },
  };
  for (const section of values) {
    if (
      !object(section) ||
      !sectionOptions[page.content.view]?.includes(section.type) ||
      seen.has(section.type) ||
      typeof section.enabled !== "boolean" ||
      !object(section.data)
    ) {
      return null;
    }
    seen.add(section.type);
    const data = section.data;
    if (section.type === "hero") {
      if (data.title !== undefined && !string(data.title)) return null;
      if (data.subtitle !== undefined && !string(data.subtitle)) return null;
      if (data.image !== undefined && !string(data.image)) return null;
      if (section.enabled && data.image) {
        const image = imageValue(data.image);
        if (!image) return null;
        preset.demo.hero.image = image;
      }
      if (section.enabled && string(data.title)) {
        preset.demo.hero.title = data.title;
      }
      if (section.enabled && string(data.subtitle)) {
        preset.demo.hero.subtitle = data.subtitle;
      }
    }
    if (section.type === "contact-form") {
      if (data.heading !== undefined && !string(data.heading)) return null;
      if (data.email !== undefined && !string(data.email)) return null;
      if (section.enabled && string(data.email)) {
        preset.demo.contactEmail = data.email;
      }
    }
  }
  return {
    sections: values
      .filter((section) => section.enabled)
      .map((section) => section.type),
    preset,
    layoutDocument: layout
      ? {
          ...structuredClone(layout),
          root: values.map((section) => ({
            id: section.id,
            kind: "section",
            type: section.type,
            enabled: section.enabled,
            props: section.data,
            children: [],
          })),
        }
      : undefined,
  };
}

function siteTheme(theme) {
  return object(theme) && safeTheme(theme)
    ? theme
    : {
        background: "#f5f2ea",
        foreground: "#17201d",
        accent: "#d4552d",
        muted: "#e5ded0",
        font: "Arial, sans-serif",
      };
}

export function snapshotPage(snapshot, path, { preview = false } = {}) {
  if (
    !safePath(path) ||
    !snapshot ||
    !string(snapshot.workspaceId) ||
    !string(snapshot.siteId) ||
    !string(snapshot.language) ||
    !Array.isArray(snapshot.pages)
  ) {
    return null;
  }
  const pages = new Map();
  for (const page of snapshot.pages) {
    if (
      !safePath(page.path) ||
      pages.has(page.path) ||
      !string(page.pageKey) ||
      !string(page.entryId) ||
      !allowedViews.has(page.content?.view) ||
      !Array.isArray(page.content.sections) ||
      !string(page.content.seo?.title) ||
      !string(page.content.seo?.description) ||
      new Set(page.content.sections).size !== page.content.sections.length ||
      page.content.sections.some(
        (section) => !sectionOptions[page.content.view].includes(section),
      )
    ) {
      return null;
    }
    if (!sectionValues(page, snapshot)) return null;
    pages.set(page.path, page);
  }
  const page = pages.get(path);
  if (!page) {
    const redirect = snapshot.redirects.find((item) => item.from === path);
    return redirect &&
      safePath(redirect.to) &&
      pages.has(redirect.to) &&
      !pages.has(redirect.from)
      ? { redirect: redirect.to }
      : null;
  }
  const values = sectionValues(page, snapshot);
  return {
    path,
    language: snapshot.language,
    siteId: snapshot.siteId,
    links: {
      home: "/",
      services: "/services",
      team: "/team",
      contact: "/contact",
    },
    content: {
      view: page.content.view,
      preset: {
        theme: values.preset.theme,
        demo: values.preset.demo,
      },
      sections: values.sections,
      ...(values.layoutDocument
        ? { layoutDocument: values.layoutDocument }
        : page.content.sectionConfigs
          ? { sectionConfigs: page.content.sectionConfigs }
          : {}),
      seo: page.content.seo,
      ...(page.content.operations
        ? { operations: page.content.operations }
        : {}),
    },
    navigation: snapshot.navigation.filter((item) => pages.has(item.path)),
    items: [],
  };
}

export function previewPage(payload, path = "/") {
  if (!object(payload)) return null;
  let snapshot = payload;
  if (payload.kind === "preset-site") {
    const { kind: _kind, siteName: _siteName, ...value } = payload;
    snapshot = value;
  }
  if (snapshot.contractVersion === 1) {
    snapshot = normalizeContractSnapshot(snapshot);
  }
  if (!snapshot) return null;
  return snapshotPage(snapshot, path, { preview: true });
}

export function previewAdminOrigin(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.origin === value
      ? value
      : null;
  } catch {
    return null;
  }
}

export function acceptPreviewMessage(event, { adminOrigin, parent, self }) {
  if (
    !previewAdminOrigin(adminOrigin) ||
    event.origin !== adminOrigin ||
    parent === self ||
    event.source !== parent
  ) {
    return null;
  }
  const data = event.data;
  if (
    !object(data) ||
    !["storefront:preview", "cms:preview"].includes(data.type)
  ) {
    return null;
  }
  const snapshot =
    data.type === "storefront:preview" ? data.payload : data.snapshot;
  const path =
    data.path ??
    (Array.isArray(snapshot?.pages)
      ? snapshot.pages.find((page) => page.path === "/")?.path
      : undefined) ??
    snapshot?.pages?.[0]?.path;
  const page = previewPage(snapshot, path);
  return page ? { snapshot, page, path } : null;
}

export function previewHeaders(adminOrigin) {
  return previewAdminOrigin(adminOrigin)
    ? {
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow, noarchive",
        "content-security-policy": `frame-ancestors ${adminOrigin}`,
        "referrer-policy": "no-referrer",
      }
    : null;
}

export function previewNavigationPath(href, baseURL) {
  if (!string(href) || !href.startsWith("/") || href.startsWith("//")) {
    return null;
  }
  if (
    string(baseURL) &&
    baseURL !== "/" &&
    baseURL.startsWith("/") &&
    !baseURL.startsWith("//") &&
    baseURL.endsWith("/") &&
    !/[?#]/.test(baseURL) &&
    href.startsWith(baseURL)
  ) {
    const path = "/" + href.slice(baseURL.length);
    return path.startsWith("//") ? null : path;
  }
  return href;
}
