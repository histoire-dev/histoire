<script lang="ts" setup>
import { defineAsyncComponent } from 'vue'

const Responsive = defineAsyncComponent(() => import('./Responsive.vue'))
</script>

<template>
  <Story title="Responsive">
    <Variant
      title="default"
      iframe
    >
      <Responsive />
    </Variant>
  </Story>
</template>
