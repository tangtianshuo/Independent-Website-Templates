export function contractFixture() {
  const preset = {
    id: 'aeroframe', version: '1.0.4', name: 'AeroFrame', description: 'Aircraft',
    theme: { background: '#080d14', foreground: '#f3f6fa', accent: '#4f7dff', muted: '#182432', font: 'Arial, sans-serif' },
    demo: {
      brand: 'AEROWORKS',
      hero: { title: 'Mission ready', subtitle: 'Reliable aerial systems.', image: 'https://example.test/hero.jpg' },
      product: { title: 'Aero X8', price: '$8,490', image: 'https://example.test/product.jpg', description: 'A modular platform.' },
      collection: { title: 'Aircraft systems', description: 'Field ready platforms.', image: 'https://example.test/collection.jpg' },
      page: { title: 'About', body: 'We build dependable systems.', image: 'https://example.test/about.jpg' },
    },
    showcase: { eyebrow: 'FIELD PROVEN', heroLabel: 'AERIAL SYSTEMS', stats: [], products: [], solutions: [], faq: [] },
  };
  return {
    contractVersion: 1,
    schemaVersion: 1,
    workspaceId: 'workspace',
    siteId: 'site',
    language: 'en',
    template: { id: 'aeroframe', version: '1.0.4' },
    pages: [{
      path: '/', pageKey: 'home', entryId: 'home-entry',
      content: { kind: 'preset-page', view: 'home', preset, sections: ['hero'], seo: { title: 'Home', description: '' }, items: [] },
    }],
    navigation: [{ id: 'home', label: 'Home', href: '/', children: [], enabled: true }],
    redirects: [],
    operations: { seoTitle: 'Home', seoDescription: '', contactFormEnabled: false },
    assets: [],
  };
}
