<script setup>
import { withBase } from 'vitepress'
</script>

<template>
  <div class="workbench-demo">
    <a :href="withBase('/demo/')" target="_self" aria-label="Open demo">
      <img
        :src="withBase('/screenshots/workbench-light.png')"
        alt="Histoire workbench with story variants, canvas tools and editable props"
        class="light-only"
        width="1600"
        height="1000"
        loading="lazy"
      >
      <img
        :src="withBase('/screenshots/workbench-dark.png')"
        alt="Histoire workbench with story variants, canvas tools and editable props"
        class="dark-only"
        width="1600"
        height="1000"
        loading="lazy"
      >
    </a>
    <a :href="withBase('/demo/')" target="_self" class="btn demo-action">
      Open demo
    </a>
  </div>
</template>

<style scoped>
.workbench-demo { margin: 32px auto; max-width: 1280px; padding: 0 24px; text-align: center; }
img { display: block; width: 100%; height: auto; border-radius: 12px; box-shadow: 0 12px 40px rgb(0 0 0 / .1); }
.demo-action { display: inline-flex; margin-top: 20px; padding: 10px 20px; }
.dark-only { display: none; }
:global(.dark) .light-only { display: none; }
:global(.dark) .dark-only { display: block; }
</style>
