<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import SessionContent from '../components/SessionContent.vue';
import { useSession } from '../composables/useSession';

const route = useRoute();
const sessionId = computed(() => route.params.id as string);
const { sections, loading, error, filename } = useSession(sessionId);
</script>

<template>
  <div class="session-detail-page">
    <header class="session-detail-page__header">
      <router-link to="/" class="session-detail-page__back">&larr; Back</router-link>
      <h1 v-if="filename" class="session-detail-page__title">{{ filename }}</h1>
    </header>

    <div v-if="loading" class="session-detail-page__loading">Loading session...</div>
    <div v-else-if="error" class="session-detail-page__error">{{ error }}</div>
    <div v-else-if="sections.length === 0" class="session-detail-page__empty">
      This session has no content.
    </div>
    <SessionContent v-else :sections="sections" />
  </div>
</template>

<style scoped>
.session-detail-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 1.5rem;
}

.session-detail-page__header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.session-detail-page__back {
  color: #4a9eff;
  text-decoration: none;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.session-detail-page__back:hover {
  text-decoration: underline;
}

.session-detail-page__title {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 1.1rem;
  color: #e0e0e0;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-detail-page__loading,
.session-detail-page__empty {
  text-align: center;
  padding: 3rem;
  color: #808080;
}

.session-detail-page__error {
  text-align: center;
  padding: 3rem;
  color: #ff5050;
}
</style>
