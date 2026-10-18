<script setup>
const config = useRuntimeConfig()
</script>

<template>
  <Story>
    <div class="example-stage example-stack">
      <Meow />

      <h3 class="example-heading">
        Nuxt runtime config
      </h3>
      <pre class="example-output">{{ config }}</pre>
      <p data-testid="config">
        {{ config.public.configFromNuxt }}
      </p>
    </div>
  </Story>
</template>
