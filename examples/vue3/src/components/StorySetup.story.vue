<script lang="ts" setup>
import InjectDemo from './InjectDemo.vue'
</script>

<template>
  <Story :meta="{ wrapper: false }" title="Story setup">
    <Variant
      id="global"
      title="Global setup"
    >
      <div class="example-stage">
        <InjectDemo />
      </div>
    </Variant>

    <Variant
      id="local"
      title="Local setup"
      :setup-app="({ app }) => {
        app.provide('demo', 'meow')
      }"
    >
      <div class="example-stage">
        <InjectDemo />
      </div>
    </Variant>

    <Variant
      id="global-component"
      title="Global component"
    >
      <div class="example-stage">
        <GlobalComp />
      </div>
    </Variant>
  </Story>
</template>
