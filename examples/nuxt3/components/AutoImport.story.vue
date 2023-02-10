<script setup>
console.log('useNuxtApp', useNuxtApp())
console.log('useNuxtApp().$config', useNuxtApp().$config)
console.log('useRuntimeConfig', useRuntimeConfig())
</script>

<template>
  <Story>
    <Meow />

    <pre>{{ config }}</pre>
  </Story>
</template>
