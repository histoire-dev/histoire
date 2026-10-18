<script lang="ts" setup>
import Responsive from './Responsive.vue'
</script>

<template>
  <Story :meta="{ wrapper: false }" title="Responsive">
    <Variant
      title="default"
      iframe
    >
      <div class="example-stage">
        <Responsive />
      </div>
    </Variant>
  </Story>
</template>
