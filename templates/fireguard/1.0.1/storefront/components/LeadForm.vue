<script setup lang="ts">
const props = defineProps<{ siteId?: string; endpoint?: string }>();
const name = ref('');
const email = ref('');
const phone = ref('');
const message = ref('');
const honeypot = ref('');
const state = ref<'idle' | 'submitting' | 'success' | 'error'>('idle');
const errorMessage = ref('');
let attemptBody = '';
let attemptKey = '';

function idempotencyKey() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

async function submit() {
  if (!props.siteId || !props.endpoint) {
    state.value = 'error';
    errorMessage.value = 'Contact form is temporarily unavailable.';
    return;
  }
  const body = {
    source: 'contact',
    schemaVersion: 1,
    name: name.value,
    email: email.value,
    phone: phone.value,
    message: message.value,
    honeypot: honeypot.value,
  };
  const fingerprint = JSON.stringify(body);
  if (fingerprint !== attemptBody) {
    attemptBody = fingerprint;
    attemptKey = idempotencyKey();
  }
  state.value = 'submitting';
  errorMessage.value = '';
  try {
    await $fetch(
      `${props.endpoint.replace(/\/$/, '')}/api/v1/sites/${encodeURIComponent(props.siteId)}/leads`,
      {
        method: 'POST',
        headers: { 'x-lead-idempotency-key': attemptKey },
        body,
      },
    );
    attemptBody = '';
    attemptKey = '';
    state.value = 'success';
    name.value = '';
    email.value = '';
    phone.value = '';
    message.value = '';
    honeypot.value = '';
  } catch {
    state.value = 'error';
    errorMessage.value =
      'Unable to send your request. Your details are saved here; please try again.';
  }
}
</script>

<template>
  <form id="contact-form" class="fire-lead-form" @submit.prevent="submit">
    <label
      >Name<input v-model="name" name="name" autocomplete="name" maxlength="120" required
    /></label>
    <label
      >Email<input
        v-model="email"
        name="email"
        type="email"
        autocomplete="email"
        maxlength="254"
        required
    /></label>
    <label>Phone<input v-model="phone" name="phone" autocomplete="tel" maxlength="64" /></label>
    <label
      >How can we help?<textarea
        v-model="message"
        name="message"
        rows="4"
        maxlength="4000"
        required
      />
    </label>
    <label class="fire-honeypot" aria-hidden="true"
      >Company<input v-model="honeypot" tabindex="-1" autocomplete="off"
    /></label>
    <button
      class="fire-button fire-button--primary"
      type="submit"
      :disabled="state === 'submitting'"
    >
      {{ state === 'submitting' ? 'Sending…' : 'Send inquiry ↗' }}
    </button>
    <p v-if="state === 'success'" class="fire-form-status fire-form-status--success" role="status">
      Thanks. We’ll be in touch shortly.
    </p>
    <p v-if="state === 'error'" class="fire-form-status fire-form-status--error" role="alert">
      {{ errorMessage }} <button type="button" @click="state = 'idle'">Try again</button>
    </p>
  </form>
</template>
