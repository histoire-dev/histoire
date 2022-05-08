<script lang="ts" setup>
import DefaultTheme from 'vitepress/theme'
import DarkModeToggle from './DarkModeToggle.vue'
import SponsorButton from './SponsorButton.vue'
const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #navbar-search>
      <SponsorButton
        class="md:htw-ml-4"
        look="link"
      />
      <DarkModeToggle />
    </template>
  </Layout>
</template>
