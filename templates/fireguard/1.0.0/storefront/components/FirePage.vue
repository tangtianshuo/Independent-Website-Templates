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
const quoteHref = computed(() => demo.value.contactEmail ? `mailto:${encodeURIComponent(demo.value.contactEmail)}?subject=Fire%20equipment%20inquiry` : companyPath.value);
const themeStyle = computed(() => ({ '--fire-bg': content.value.preset.theme.background,
  '--fire-fg': content.value.preset.theme.foreground, '--fire-accent': content.value.preset.theme.accent,
  '--fire-muted': content.value.preset.theme.muted, '--fire-font': content.value.preset.theme.font }));
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
  <div class="fire-site" :style="themeStyle" @click.capture="navigatePreview">
    <header class="fire-header">
      <NuxtLink class="fire-brand" :to="published.links.home"><span class="fire-brand__mark" aria-hidden="true">F</span><span>{{ demo.brand }}</span></NuxtLink>
      <nav aria-label="主导航"><NuxtLink v-for="link in published.navigation" :key="link.path" :to="link.path">{{ link.label }}</NuxtLink></nav>
      <a class="fire-header__cta" :href="quoteHref">咨询选型 <span aria-hidden="true">↗</span></a>
      <button class="fire-header__menu" type="button" :aria-expanded="menuOpen" aria-controls="mobile-navigation" @click="menuOpen = !menuOpen">{{ menuOpen ? '关闭' : '菜单' }}</button>
      <div v-if="menuOpen" id="mobile-navigation" class="fire-mobile-panel"><NuxtLink v-for="link in published.navigation" :key="link.path" :to="link.path" @click="menuOpen = false">{{ link.label }}</NuxtLink><a :href="quoteHref">咨询选型 ↗</a></div>
    </header>

    <main v-if="view === 'home'">
      <template v-for="section in content.sections" :key="section">
      <section v-if="section === 'hero'" class="fire-hero" :style="{ '--fire-hero-image': `url('${demo.hero.image}')` }">
        <div class="fire-hero__content"><p class="fire-kicker">{{ showcase?.heroLabel || 'FIREGUARD / 消防设备' }}</p><h1>{{ demo.hero.title }}</h1><p class="fire-hero__intro">{{ demo.hero.subtitle }}</p><div class="fire-hero__actions"><NuxtLink class="fire-button fire-button--primary" :to="collectionPath">查看设备目录 <span aria-hidden="true">→</span></NuxtLink><a class="fire-button fire-button--quiet" :href="quoteHref">了解服务流程</a></div><div class="fire-hero__foot"><span>01 / 04</span><span>为日常消防管理而准备</span><span aria-hidden="true">↓</span></div></div>
        <div class="fire-hero__image-label"><span class="fire-pulse"></span> FIRE SAFETY / EQUIPMENT</div>
      </section>
      <template v-if="section === 'feature'">
        <section class="fire-intro fire-wrap"><p class="fire-kicker">{{ showcase?.eyebrow }}</p><h2>{{ demo.collection.title }}</h2><p>{{ demo.collection.description }}</p><div class="fire-stat-row"><div v-for="stat in showcase?.stats" :key="stat.label" class="fire-stat"><strong>{{ stat.value }}</strong><span>{{ stat.label }}</span></div></div></section>
        <section id="platforms" class="fire-platforms fire-wrap"><div class="fire-section-heading"><div><p class="fire-kicker">设备目录</p><h2>从基础配备到日常巡检</h2></div><NuxtLink :to="collectionPath">查看全部设备 <span aria-hidden="true">↗</span></NuxtLink></div><div class="fire-product-grid"><NuxtLink v-for="(item, index) in published.items" :key="item.path" class="fire-product-card" :to="item.path"><div class="fire-product-card__image"><img v-if="item.image" :src="item.image" :alt="item.label" loading="lazy"><span class="fire-index">0{{ index + 1 }}</span><span class="fire-arrow" aria-hidden="true">↗</span></div><div class="fire-product-card__body"><div><p class="fire-kicker">{{ demo.brand }} / 消防设备</p><h3>{{ item.label }}</h3></div><strong>{{ item.price }}</strong></div><p class="fire-product-card__description">{{ item.description }}</p></NuxtLink></div></section>
        <section v-if="showcase?.solutions?.length" class="fire-solutions fire-wrap"><div class="fire-section-heading"><div><p class="fire-kicker">应用场景</p><h2>围绕空间，配置所需设备</h2></div><span class="fire-muted">场景 / 设备 / 管理</span></div><div class="fire-solution-grid"><article v-for="(solution, index) in showcase.solutions" :key="solution.title" class="fire-solution-card"><img :src="solution.image" :alt="solution.title" loading="lazy"><div><p class="fire-kicker">场景 / 0{{ index + 1 }}</p><h3>{{ solution.title }}</h3><p>{{ solution.description }}</p><a :href="quoteHref">咨询场景配备 <span aria-hidden="true">↗</span></a></div></article></div></section>
        <section class="fire-story"><div class="fire-story__image" :style="{ backgroundImage: `url('${demo.page.image}')` }"></div><div class="fire-story__content"><p class="fire-kicker">关注设备的整个使用周期</p><h2>让设备选型与日常管理更加清晰。</h2><p>{{ demo.page.body }}</p><NuxtLink :to="companyPath">了解我们 →</NuxtLink></div></section>
        <section class="fire-faq fire-wrap"><div><p class="fire-kicker">选型与维护</p><h2>采购前，你可能关心这些</h2><p>从使用环境、采购清单到维护记录，逐项梳理需求。</p></div><div class="fire-faq__list"><details v-for="faq in showcase?.faq" :key="faq.question"><summary>{{ faq.question }}<span aria-hidden="true">+</span></summary><p>{{ faq.answer }}</p></details></div></section>
        <section id="contact" class="fire-contact fire-wrap"><div><p class="fire-kicker">从需求开始</p><h2>告诉我们，你的场所需要什么。</h2></div><a class="fire-button fire-button--primary" :href="quoteHref">咨询选型 ↗</a></section>
      </template>
      </template>
    </main>
    <main v-else-if="view === 'collection'" class="fire-inner fire-wrap"><template v-for="section in content.sections" :key="section"><template v-if="section === 'heading'"><p class="fire-kicker">消防设备 / 产品目录</p><h1>{{ demo.collection.title }}</h1><p class="fire-page-intro">{{ demo.collection.description }}</p></template><div v-if="section === 'grid'" class="fire-product-grid fire-product-grid--catalog"><NuxtLink v-for="(item, index) in published.items" :key="item.path" class="fire-product-card" :to="item.path"><div class="fire-product-card__image"><img v-if="item.image" :src="item.image" :alt="item.label"><span class="fire-index">0{{ index + 1 }}</span><span class="fire-arrow" aria-hidden="true">↗</span></div><div class="fire-product-card__body"><div><p class="fire-kicker">设备展示 / 参考选型</p><h3>{{ item.label }}</h3></div><strong>{{ item.price }}</strong></div><p class="fire-product-card__description">{{ item.description }}</p></NuxtLink></div></template></main>
    <main v-else-if="view === 'product'" class="fire-product-page fire-wrap"><p class="fire-kicker">产品详情 / {{ demo.brand }}</p><div class="fire-product-page__grid"><template v-for="section in content.sections" :key="section"><div v-if="section === 'gallery'" class="fire-product-page__image"><img v-if="demo.product.image" :src="demo.product.image" :alt="demo.product.title"></div><div v-else-if="section === 'information'" class="fire-product-page__info"><p class="fire-kicker">FIRE SAFETY EQUIPMENT</p><h1>{{ demo.product.title }}</h1><strong>{{ demo.product.price }}</strong><ul><li v-for="stat in showcase?.stats" :key="stat.label"><span>{{ stat.label }}</span><b>{{ stat.value }}</b></li></ul><a class="fire-button fire-button--primary" :href="quoteHref">咨询此设备 ↗</a><small>图片为 AI 生成展示图，标价为演示参考价。实际规格、适用范围与报价以供应商资料及专业核验为准。</small></div><p v-else-if="section === 'description'" class="fire-product-description">{{ demo.product.description }}</p></template></div></main>
    <main v-else class="fire-inner fire-wrap"><p class="fire-kicker">{{ demo.brand }} / 关于我们</p><template v-for="section in content.sections" :key="section"><div v-if="section === 'story'" class="fire-about"><div><h1>{{ demo.page.title }}</h1><p>{{ demo.page.body }}</p><a class="fire-button fire-button--primary" :href="quoteHref">联系我们 ↗</a></div><img v-if="demo.page.image" :src="demo.page.image" :alt="demo.page.title"></div></template></main>
    <footer class="fire-footer"><NuxtLink class="fire-brand" :to="published.links.home"><span class="fire-brand__mark" aria-hidden="true">F</span><span>{{ demo.brand }}</span></NuxtLink><span>FIREGUARD / 消防设备</span><small>© {{ new Date().getFullYear() }} {{ demo.brand }}</small></footer>
  </div>
</template>
