<script setup lang="ts">
function triggerUpload(): void {
  document.dispatchEvent(new CustomEvent('app:upload'));
}
</script>

<template>
  <header class="app-header">
    <div class="app-header__left">
      <router-link
        to="/"
        class="app-header__brand"
      >
        <div class="app-header__logo">
          E
        </div>
        <span class="app-header__name">Elise</span>
      </router-link>
      <nav class="app-header__nav">
        <router-link
          v-slot="{ isExactActive }"
          to="/"
          class="app-header__nav-link"
          :class="{ 'app-header__nav-link--active': isExactActive }"
        >
          Sessions
        </router-link>
      </nav>
    </div>
    <div class="app-header__right">
      <button
        class="btn btn--primary btn--sm"
        @click="triggerUpload"
      >
        <span class="icon icon--sm icon-upload" />
        Upload
      </button>
    </div>
  </header>
</template>

<style scoped>
/* app-header layout and sub-elements come from design/styles/components.css */
/* The following adds fixed-height enforcement per design system contract */
.app-header {
  height: var(--header-height);
  position: sticky;
  top: 0;
  z-index: 100;
}

.app-header__logo {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border-radius: var(--radius-sm);
  font-weight: var(--weight-bold);
  font-size: var(--text-sm);
}
</style>
