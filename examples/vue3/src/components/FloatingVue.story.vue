<script setup lang="ts">
import FloatingVue from './FloatingVue.vue'
</script>

<template>
  <Story
    title="Style Isolation/Floating Vue"
    :layout="{
      type: 'grid',
      width: 360,
    }"
  >
    <Variant title="user-themed">
      <FloatingVue />
    </Variant>
  </Story>
</template>
