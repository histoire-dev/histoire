<script lang="ts" setup>
import HstCheckbox from './HstCheckbox.vue'

function initState () {
  return {
    checked: false,
  }
}
</script>

<template>
  <Story
    title="HstCheckbox"
    :layout="{ type: 'single', iframe: false }"
  >
    <Variant
      title="playground"
      :init-state="initState"
    >
      <template #default="{ state }">
        <HstCheckbox
          v-model="state.checked"
          title="Label"
        />
      </template>

      <template #controls="{ state }">
        <HstCheckbox
          v-model="state.checked"
          title="Label"
        />
      </template>
    </Variant>
  </Story>
</template>
