<script setup lang="ts">
import type { Session } from '../../shared/types/session.js';

defineProps<{
  sessions: Session[];
  loading: boolean;
  error: string | null;
}>();

const emit = defineEmits<{
  delete: [id: string];
}>();

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function confirmDelete(id: string, filename: string): void {
  if (confirm(`Delete "${filename}"?`)) {
    emit('delete', id);
  }
}
</script>

<template>
  <div class="session-list">
    <div
      v-if="loading"
      class="session-list__loading"
    >
      Loading sessions...
    </div>
    <div
      v-else-if="error"
      class="session-list__error"
    >
      {{ error }}
    </div>
    <div
      v-else-if="sessions.length === 0"
      class="session-list__empty"
    >
      <p>No sessions yet.</p>
      <p class="session-list__empty-hint">
        Upload a <code>.cast</code> file to get started.
      </p>
    </div>
    <div
      v-else
      class="session-list__grid grid"
    >
      <router-link
        v-for="session in sessions"
        :key="session.id"
        :to="{ name: 'session-detail', params: { id: session.id } }"
        class="session-card"
      >
        <div class="session-card__header">
          <span class="session-card__filename">{{ session.filename }}</span>
          <button
            class="session-card__delete"
            title="Delete session"
            @click.prevent.stop="confirmDelete(session.id, session.filename)"
          >
            <span class="icon icon--sm icon-trash" />
          </button>
        </div>
        <div class="session-card__meta">
          <span class="session-card__meta-item">{{ formatSize(session.size_bytes) }}</span>
          <span
            v-if="session.marker_count > 0"
            class="badge badge--sm badge--accent"
          >
            {{ session.marker_count }} marker{{ session.marker_count !== 1 ? 's' : '' }}
          </span>
        </div>
        <div class="session-card__footer">
          <span class="session-list__date">{{ formatDate(session.uploaded_at) }}</span>
        </div>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
/* session-card styles come from design/styles/components.css */

.session-list__loading {
  text-align: center;
  padding: var(--space-8);
  color: var(--text-muted);
}

.session-list__error {
  text-align: center;
  padding: var(--space-8);
  color: var(--status-error);
}

.session-list__empty {
  text-align: center;
  padding: var(--space-8);
  color: var(--text-muted);
}

.session-list__empty-hint {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-disabled);
}

.session-list__empty-hint code {
  color: var(--accent-primary);
  background: var(--accent-primary-subtle);
  padding: 0.1em 0.4em;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

.session-list__grid {
  display: grid;
  gap: var(--grid-gap);
}

.session-card__delete {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: var(--space-1);
  line-height: 1;
  transition: color var(--duration-fast) var(--easing-default);
  display: flex;
  align-items: center;
}

.session-card__delete:hover {
  color: var(--status-error);
}

.session-list__date {
  font-size: var(--text-xs);
  color: var(--text-disabled);
  font-family: var(--font-mono);
  letter-spacing: var(--tracking-wider);
}
</style>
