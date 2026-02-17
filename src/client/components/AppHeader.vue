<script setup lang="ts">
</script>

<template>
  <header class="app-header">
    <router-link to="/" class="app-header__brand">RAGTS</router-link>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid #1a1a1a;
  background: #0f0f0f;
}

.app-header__brand {
  font-size: 1rem;
  font-weight: 700;
  color: #4a9eff;
  text-decoration: none;
  letter-spacing: 0.08em;
}

.app-header__brand:hover {
  opacity: 0.8;
}
</style>
