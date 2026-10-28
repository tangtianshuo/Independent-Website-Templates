<script setup lang="ts">
const props = defineProps<{ page: any; preview?: boolean }>();
const emit = defineEmits<{ navigate: [path: string] }>();
const published = computed(() => props.page);
const content = computed(() => published.value.content);
const demo = computed(() => content.value.preset.demo);
const showcase = computed(() => content.value.preset.showcase);
const view = computed(() => content.value.view);
const menuOpen = ref(false);
const collectionPath = computed(() => published.value.links.collection);
const companyPath = computed(() => published.value.links.company);
const quoteHref = computed(() => demo.value.contactEmail ? `mailto:${encodeURIComponent(demo.value.contactEmail)}?subject=Project%20inquiry` : 'mailto:');
const themeStyle = computed(() => ({ '--aero-bg': content.value.preset.theme.background,
  '--aero-fg': content.value.preset.theme.foreground, '--aero-blue': content.value.preset.theme.accent,
  '--aero-muted': content.value.preset.theme.muted, '--aero-font': content.value.preset.theme.font }));
function navigatePreview(event: MouseEvent) {
  if (!props.preview) return;
  const link = (event.target as Element)?.closest('a');
  const href = link?.getAttribute('href');
  if (!href?.startsWith('/') || href.startsWith('//')) return;
  event.preventDefault(); event.stopPropagation(); menuOpen.value = false;
  emit('navigate', href);
}
useHead(() => ({ htmlAttrs: { lang: published.value.language }, title: content.value.seo.title,
  meta: [{ name: 'description', content: content.value.seo.description }] }));
</script>

<template>
  <div class="aero-site" :style="themeStyle" @click.capture="navigatePreview">
    <header class="aero-header">
      <NuxtLink class="aero-brand" :to="published.links.home"><span class="aero-brand__mark" aria-hidden="true">A</span><span>{{ demo.brand }}</span></NuxtLink>
      <nav aria-label="Main navigation"><NuxtLink v-for="link in published.navigation" :key="link.path" :to="link.path">{{ link.label }}</NuxtLink></nav>
      <a class="aero-header__cta" :href="quoteHref">Request a quote <span aria-hidden="true">↗</span></a>
      <button class="aero-header__menu" type="button" :aria-expanded="menuOpen" aria-controls="mobile-navigation" @click="menuOpen = !menuOpen">{{ menuOpen ? 'Close' : 'Menu' }}</button>
      <div v-if="menuOpen" id="mobile-navigation" class="aero-mobile-panel"><NuxtLink v-for="link in published.navigation" :key="link.path" :to="link.path" @click="menuOpen = false">{{ link.label }}</NuxtLink><a :href="quoteHref">Request a quote ↗</a></div>
    </header>

    <main v-if="view === 'home'">
      <template v-for="section in content.sections" :key="section">
      <section v-if="section === 'hero'" class="aero-hero" :style="{ '--aero-hero-image': `url('${demo.hero.image}')` }">
        <div class="aero-hero__content"><p class="aero-kicker">{{ showcase?.heroLabel || 'UNMANNED SYSTEMS / FIELD PROVEN' }}</p><h1>{{ demo.hero.title }}</h1><p class="aero-hero__intro">{{ demo.hero.subtitle }}</p><div class="aero-hero__actions"><NuxtLink class="aero-button aero-button--primary" :to="collectionPath">Explore platforms <span aria-hidden="true">→</span></NuxtLink><a class="aero-button aero-button--quiet" :href="quoteHref">Talk to an engineer</a></div><div class="aero-hero__foot"><span>01 / 04</span><span>Designed around the mission</span><span aria-hidden="true">↓</span></div></div>
        <div class="aero-hero__image-label"><span class="aero-pulse"></span> FIELD SYSTEMS / ONLINE</div>
      </section>
      <template v-if="section === 'feature'">
        <section class="aero-intro aero-wrap"><p class="aero-kicker">{{ showcase?.eyebrow }}</p><h2>{{ demo.collection.title }}</h2><p>{{ demo.collection.description }}</p><div class="aero-stat-row"><div v-for="stat in showcase?.stats" :key="stat.label" class="aero-stat"><strong>{{ stat.value }}</strong><span>{{ stat.label }}</span></div></div></section>
        <section id="platforms" class="aero-platforms aero-wrap"><div class="aero-section-heading"><div><p class="aero-kicker">THE FLEET</p><h2>Platforms built for the field</h2></div><NuxtLink :to="collectionPath">View platform range <span aria-hidden="true">↗</span></NuxtLink></div><div class="aero-product-grid"><NuxtLink v-for="(item, index) in published.items" :key="item.path" class="aero-product-card" :to="item.path"><div class="aero-product-card__image"><img v-if="item.image" :src="item.image" :alt="item.label" loading="lazy"><span class="aero-index">0{{ index + 1 }}</span><span class="aero-arrow" aria-hidden="true">↗</span></div><div class="aero-product-card__body"><div><p class="aero-kicker">{{ demo.brand }} / UAV</p><h3>{{ item.label }}</h3></div><strong>{{ item.price }}</strong></div><p class="aero-product-card__description">{{ item.description }}</p></NuxtLink></div></section>
        <section v-if="showcase?.solutions?.length" class="aero-solutions aero-wrap"><div class="aero-section-heading"><div><p class="aero-kicker">MISSION PROFILES</p><h2>One system. More ways to work.</h2></div><span class="aero-muted">01 — 03 / APPLICATIONS</span></div><div class="aero-solution-grid"><article v-for="(solution, index) in showcase.solutions" :key="solution.title" class="aero-solution-card"><img :src="solution.image" :alt="solution.title" loading="lazy"><div><p class="aero-kicker">MISSION / 0{{ index + 1 }}</p><h3>{{ solution.title }}</h3><p>{{ solution.description }}</p><a :href="quoteHref">Discuss this mission <span aria-hidden="true">↗</span></a></div></article></div></section>
        <section class="aero-story"><div class="aero-story__image" :style="{ backgroundImage: `url('${demo.page.image}')` }"></div><div class="aero-story__content"><p class="aero-kicker">ENGINEERED FOR REAL OPERATIONS</p><h2>Confidence from takeoff to touchdown.</h2><p>{{ demo.page.body }}</p><NuxtLink :to="companyPath">Our approach →</NuxtLink></div></section>
        <section class="aero-faq aero-wrap"><div><p class="aero-kicker">SUPPORT &amp; OPERATIONS</p><h2>Questions from the field.</h2><p>Clear answers for teams evaluating their next aerial system.</p></div><div class="aero-faq__list"><details v-for="faq in showcase?.faq" :key="faq.question"><summary>{{ faq.question }}<span aria-hidden="true">+</span></summary><p>{{ faq.answer }}</p></details></div></section>
        <section id="contact" class="aero-contact aero-wrap"><div><p class="aero-kicker">START A CONVERSATION</p><h2>Tell us what the mission demands.</h2></div><a class="aero-button aero-button--primary" :href="quoteHref">Request a quote ↗</a></section>
      </template>
      </template>
    </main>
    <main v-else-if="view === 'collection'" class="aero-inner aero-wrap"><template v-for="section in content.sections" :key="section"><template v-if="section === 'heading'"><p class="aero-kicker">AIRCRAFT / PRODUCT RANGE</p><h1>{{ demo.collection.title }}</h1><p class="aero-page-intro">{{ demo.collection.description }}</p></template><div v-if="section === 'grid'" class="aero-product-grid aero-product-grid--catalog"><NuxtLink v-for="(item, index) in published.items" :key="item.path" class="aero-product-card" :to="item.path"><div class="aero-product-card__image"><img v-if="item.image" :src="item.image" :alt="item.label"><span class="aero-index">0{{ index + 1 }}</span><span class="aero-arrow" aria-hidden="true">↗</span></div><div class="aero-product-card__body"><div><p class="aero-kicker">MULTIROTOR / MODULAR</p><h3>{{ item.label }}</h3></div><strong>{{ item.price }}</strong></div><p class="aero-product-card__description">{{ item.description }}</p></NuxtLink></div></template></main>
    <main v-else-if="view === 'product'" class="aero-product-page aero-wrap"><p class="aero-kicker">PLATFORM / {{ demo.brand }}</p><div class="aero-product-page__grid"><template v-for="section in content.sections" :key="section"><div v-if="section === 'gallery'" class="aero-product-page__image"><img v-if="demo.product.image" :src="demo.product.image" :alt="demo.product.title"></div><div v-else-if="section === 'information'" class="aero-product-page__info"><p class="aero-kicker">MODULAR MULTIROTOR SYSTEM</p><h1>{{ demo.product.title }}</h1><strong>{{ demo.product.price }}</strong><ul><li v-for="stat in showcase?.stats" :key="stat.label"><span>{{ stat.label }}</span><b>{{ stat.value }}</b></li></ul><a class="aero-button aero-button--primary" :href="quoteHref">Configure this platform ↗</a><small>Final configuration and pricing depend on payload and mission requirements.</small></div><p v-else-if="section === 'description'" class="aero-product-description">{{ demo.product.description }}</p></template></div></main>
    <main v-else class="aero-inner aero-wrap"><p class="aero-kicker">{{ demo.brand }} / COMPANY</p><template v-for="section in content.sections" :key="section"><div v-if="section === 'story'" class="aero-about"><div><h1>{{ demo.page.title }}</h1><p>{{ demo.page.body }}</p><a class="aero-button aero-button--primary" :href="quoteHref">Contact the team ↗</a></div><img v-if="demo.page.image" :src="demo.page.image" :alt="demo.page.title"></div></template></main>
    <footer class="aero-footer"><NuxtLink class="aero-brand" :to="published.links.home"><span class="aero-brand__mark" aria-hidden="true">A</span><span>{{ demo.brand }}</span></NuxtLink><span>UNMANNED SYSTEMS / FIELD PROVEN</span><small>© {{ new Date().getFullYear() }} {{ demo.brand }}</small></footer>
  </div>
</template>
