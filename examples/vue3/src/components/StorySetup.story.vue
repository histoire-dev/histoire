<script lang="ts" setup>
import InjectDemo from './InjectDemo.vue'
</script>

<template>
  <Story title="Story setup">
    <Variant
      id="global"
      title="Global setup"
    >
      <InjectDemo />
    </Variant>

    <Variant
      id="local"
      title="Local setup"
      :setup-app="({ app }) => {
        app.provide('demo', 'meow')
      }"
    >
      <InjectDemo />
    </Variant>
  </Story>
</template>
