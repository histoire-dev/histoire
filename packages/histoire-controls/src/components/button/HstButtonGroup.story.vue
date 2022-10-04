<script lang="ts" setup>
import HstButtonGroup from './HstButtonGroup.vue'

const options = {
  slow: 'Slow',
  fast: 'Fast',
  max: 'Max',
}

const flatOptions = Object.keys(options)

const objectOptions = Object.keys(options).map(key => ({
  label: options[key],
  value: key,
}))

function initState () {
  return {
    speed: flatOptions[0],
  }
}
</script>

<template>
  <Story
    title="HstButtonGroup"
    group="controls"
    :layout="{ type: 'single', iframe: false }"
  >
    <Variant
      title="playground"
      :init-state="initState"
    >
      <template #default="{ state }">
        <HstButtonGroup
          v-model="state.speed"
          title="Label"
          :options="objectOptions"
        />
      </template>

      <template #controls="{ state }">
        <HstButtonGroup
          v-model="state.speed"
          title="Label"
          :options="objectOptions"
        />
      </template>
    </Variant>
  </Story>
</template>
