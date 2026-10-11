<script setup lang="ts">
import VisualCard from './VisualCard.vue'
</script>

<template>
  <Story id="visual-card" title="Visual card">
    <Variant id="default" title="Default">
      <VisualCard />
    </Variant>
    <Variant id="emphasized" title="Emphasized">
      <VisualCard emphasized />
    </Variant>
  </Story>
</template>
