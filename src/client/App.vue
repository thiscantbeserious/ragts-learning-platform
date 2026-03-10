<template>
  <div id="app">
    <AppHeader />
    <router-view />
  </div>
</template>

<script setup lang="ts">
import AppHeader from './components/AppHeader.vue';
</script>

<!-- Global styles removed — design system CSS (layout.css) provides
     the reset, body styling, and typography via main.ts imports.
     App-specific overrides live in styles/app_overrides.css. -->
