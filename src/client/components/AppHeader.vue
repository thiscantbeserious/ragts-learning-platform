<script setup lang="ts">
</script>

<template>
  <header class="app-header">
    <div class="app-header__left">
      <router-link
        to="/"
        class="app-header__brand"
      >
        <div class="app-header__logo">
          R
        </div>
        <span class="app-header__name">Erika</span>
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
      <router-link
        to="/"
        class="btn btn--primary btn--sm"
      >
        <span class="icon icon--sm icon-upload" />
        Upload
      </router-link>
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
