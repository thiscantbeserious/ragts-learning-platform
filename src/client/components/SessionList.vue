<script setup lang="ts">
import type { Session } from '../../shared/types';

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
    <div v-if="loading" class="session-list__loading">Loading sessions...</div>
    <div v-else-if="error" class="session-list__error">{{ error }}</div>
    <div v-else-if="sessions.length === 0" class="session-list__empty">
      <p>No sessions yet.</p>
      <p class="session-list__empty-hint">Upload a <code>.cast</code> file to get started.</p>
    </div>
    <div v-else class="session-list__grid">
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
          >×</button>
        </div>
        <div class="session-card__meta">
          <span class="session-card__size">{{ formatSize(session.size_bytes) }}</span>
          <span v-if="session.marker_count > 0" class="session-card__markers">
            {{ session.marker_count }} marker{{ session.marker_count !== 1 ? 's' : '' }}
          </span>
        </div>
        <div class="session-card__date">{{ formatDate(session.uploaded_at) }}</div>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.session-list__loading,
.session-list__error {
  text-align: center;
  padding: 2rem;
  color: #808080;
}

.session-list__error {
  color: #ff5050;
}

.session-list__empty {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.session-list__empty-hint {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: #555;
}

.session-list__empty-hint code {
  color: #4a9eff;
  background: rgba(74, 158, 255, 0.1);
  padding: 0.1em 0.4em;
  border-radius: 4px;
}

.session-list__grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.session-card {
  display: block;
  padding: 1rem 1.25rem;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s, background-color 0.2s;
}

.session-card:hover {
  border-color: #4a9eff;
  background: #1e1e1e;
}

.session-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.session-card__filename {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.95rem;
  color: #e0e0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-card__delete {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0 0.25rem;
  line-height: 1;
  transition: color 0.2s;
}

.session-card__delete:hover {
  color: #ff5050;
}

.session-card__meta {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: #808080;
  margin-bottom: 0.25rem;
}

.session-card__markers {
  color: #4a9eff;
}

.session-card__date {
  font-size: 0.75rem;
  color: #555;
}
</style>
