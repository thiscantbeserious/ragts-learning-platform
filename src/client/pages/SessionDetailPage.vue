<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import SessionContent from '../components/SessionContent.vue';
import SkeletonMain from '../components/SkeletonMain.vue';
import { useSession } from '../composables/useSession';

const route = useRoute();
const sessionId = computed(() => route.params.id as string);
const { sections, snapshot, loading, error, filename } = useSession(sessionId);
</script>

<template>
  <div class="session-detail-page container">
    <header class="session-detail-page__header">
      <nav class="breadcrumb">
        <router-link
          to="/"
          class="breadcrumb__link"
        >
          Sessions
        </router-link>
        <span class="breadcrumb__separator">
          <span class="icon icon--xs icon-chevron-right" />
        </span>
        <span
          v-if="filename"
          class="breadcrumb__current"
        >
          {{ filename }}
        </span>
      </nav>
    </header>

    <SkeletonMain v-if="loading" />
    <div
      v-else-if="error"
      class="session-detail-page__state session-detail-page__state--error"
    >
      {{ error }}
    </div>
    <div
      v-else-if="sections.length === 0 && !snapshot"
      class="session-detail-page__state"
    >
      This session has no content.
    </div>
    <SessionContent
      v-else
      :snapshot="snapshot"
      :sections="sections"
      :default-collapsed="false"
    />
  </div>
</template>

<style scoped>
.session-detail-page {
  padding: var(--space-6) var(--container-padding);
}

.session-detail-page__header {
  margin-bottom: var(--space-6);
}

.session-detail-page__state {
  text-align: center;
  padding: var(--space-12);
  color: var(--text-muted);
}

.session-detail-page__state--error {
  color: var(--status-error);
}
</style>
