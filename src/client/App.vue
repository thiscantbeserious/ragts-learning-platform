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
body {
  font-family: var(--font-body);
  background: var(--bg-page);
  color: var(--text-primary);
}

a {
  color: var(--accent-primary);
}
</style>
