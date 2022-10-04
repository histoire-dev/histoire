<script lang="ts" setup>
import HstButton from './HstButton.vue'
</script>

<template>
  <Story
    title="HstButton"
    group="controls"
    :layout="{ type: 'single', iframe: false }"
  >
    <HstButton>
      Click me!
    </HstButton>
  </Story>
</template>
