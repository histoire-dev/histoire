<script lang="ts" setup>
import DefaultTheme from 'vitepress/theme'
import DarkModeToggle from './DarkModeToggle.vue'
const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #navbar-search>
      <DarkModeToggle />
    </template>
  </Layout>
</template>
