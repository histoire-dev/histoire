<script lang="ts" setup>
import InjectDemo from './InjectDemo.vue'
</script>

<template>
  <Story title="Story setup">
    <Variant title="Global setup">
      <InjectDemo />
    </Variant>

    <Variant
      title="Local setup"
      :setup-app="({ app }) => {
        app.provide('demo', 'meow')
      }"
    >
      <InjectDemo />
    </Variant>
  </Story>
</template>
