<template>
  <div id="app">
    <AppHeader />
    <router-view />
  </div>
</template>

<script setup lang="ts">
import AppHeader from './components/AppHeader.vue';
</script>

<style>
/* body base styles (font, background, color) come from design/styles/layout.css */

a {
  color: var(--accent-primary);
}
</style>
