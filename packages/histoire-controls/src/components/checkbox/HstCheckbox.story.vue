<script lang="ts" setup>
import HstCheckbox from './HstCheckbox.vue'

function initState () {
  return {
    checked: false,
  }
}
</script>

<template>
  <Story title="HstCheckbox">
    <Variant
      title="playground"
      :init-state="initState"
    >
      <template #default="{ state }">
        <HstCheckbox
          v-model="state.checked"
        >
          Label
        </HstCheckbox>
      </template>

      <template #controls="{ state }">
        <HstCheckbox
          v-model="state.checked"
        >
          Label
        </HstCheckbox>
      </template>
    </Variant>
  </Story>
</template>
