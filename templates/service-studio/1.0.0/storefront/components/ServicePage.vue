<script setup lang="ts">
import { previewNavigationPath } from "#preview-shared/snapshot.mjs";

const props = defineProps<{ page: any; preview?: boolean }>();
const emit = defineEmits<{ navigate: [path: string] }>();
const content = computed(() => props.page.content);
const demo = computed(() => content.value.preset.demo);
const runtimeConfig = useRuntimeConfig();
const email = computed(() => demo.value.contactEmail || "");
const contactHref = computed(() => `mailto:${encodeURIComponent(email.value)}`);
const sections = computed(() => new Set(content.value.sections));
const hasHero = computed(() => sections.value.has("hero"));
const hasServices = computed(() => sections.value.has("service-list"));
const hasTeam = computed(() => sections.value.has("team-grid"));
const hasContact = computed(() => sections.value.has("contact-form"));
const leadEnabled = computed(
  () =>
    !props.preview &&
    content.value.operations?.contactFormEnabled === true &&
    !!props.page.siteId &&
    !!runtimeConfig.public.ingestOrigin,
);
const themeStyle = computed(() => ({
  "--studio-bg": content.value.preset.theme.background,
  "--studio-fg": content.value.preset.theme.foreground,
  "--studio-accent": content.value.preset.theme.accent,
  "--studio-muted": content.value.preset.theme.muted,
  "--studio-font": content.value.preset.theme.font,
}));

function navigatePreview(event: MouseEvent) {
  if (!props.preview) return;
  const link = (event.target as Element)?.closest("a");
  const path = previewNavigationPath(
    link?.getAttribute("href"),
    runtimeConfig.app.baseURL,
  );
  if (path === null) return;
  event.preventDefault();
  event.stopPropagation();
  emit("navigate", path);
}
useHead(() => ({
  htmlAttrs: { lang: props.page.language },
  title: content.value.seo.title,
  meta: [{ name: "description", content: content.value.seo.description }],
}));
</script>

<template>
  <div
    class="service-site"
    :style="themeStyle"
    @click.capture="navigatePreview"
  >
    <header class="service-header">
      <NuxtLink class="service-brand" to="/">{{ demo.brand }}</NuxtLink>
      <nav aria-label="Main navigation">
        <NuxtLink
          v-for="link in page.navigation"
          :key="link.path"
          :to="link.path"
        >
          {{ link.label }}
        </NuxtLink>
      </nav>
      <a
        class="service-header__cta"
        :href="leadEnabled ? '/contact#contact-form' : contactHref"
        >Start a conversation ↗</a
      >
    </header>

    <main>
      <section v-if="hasHero" data-section-type="hero" class="service-hero">
        <div class="service-wrap">
          <p class="service-kicker">Strategy · design · delivery</p>
          <h1>{{ demo.hero.title }}</h1>
          <p>{{ demo.hero.subtitle }}</p>
          <a class="service-button" href="/contact">Discuss your next move</a>
        </div>
        <img v-if="demo.hero.image" :src="demo.hero.image" alt="" />
      </section>

      <section
        v-if="hasServices"
        data-section-type="service-list"
        class="service-section"
      >
        <div class="service-wrap">
          <p class="service-kicker">What we do</p>
          <h2>
            {{
              content.view === "home"
                ? "Practical services, clearly scoped."
                : demo.hero.title
            }}
          </h2>
          <div class="service-card">
            <span>01</span>
            <h3>{{ demo.hero.title }}</h3>
            <p>{{ demo.hero.subtitle }}</p>
            <NuxtLink to="/services/discovery">See how it works →</NuxtLink>
          </div>
        </div>
      </section>

      <section
        v-if="hasTeam"
        data-section-type="team-grid"
        class="service-section service-team"
      >
        <div class="service-wrap">
          <p class="service-kicker">The people behind the work</p>
          <h2>Senior practitioners, working together.</h2>
          <article>
            <img v-if="demo.hero.image" :src="demo.hero.image" alt="" />
            <div>
              <h3>{{ demo.hero.title }}</h3>
              <p>{{ demo.hero.subtitle }}</p>
            </div>
          </article>
        </div>
      </section>

      <section
        v-if="hasContact"
        data-section-type="contact-form"
        class="service-section service-contact"
      >
        <div class="service-wrap service-contact__grid">
          <div>
            <p class="service-kicker">Start a conversation</p>
            <h2>Bring us the problem, not a polished brief.</h2>
            <p>
              Tell us what is changing and what a useful outcome looks like.
            </p>
            <a v-if="!leadEnabled && email" :href="contactHref">{{ email }}</a>
          </div>
          <LeadForm
            v-if="leadEnabled"
            :site-id="page.siteId"
            :endpoint="runtimeConfig.public.ingestOrigin"
          />
          <p v-else class="service-contact__note">
            Use the email address above to start a conversation.
          </p>
        </div>
      </section>
    </main>

    <footer class="service-footer">
      <span>{{ demo.brand }}</span>
      <span>Clear thinking. Useful work.</span>
    </footer>
  </div>
</template>
