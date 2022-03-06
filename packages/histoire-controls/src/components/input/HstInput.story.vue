<script lang="ts" setup>
import HstInput from './HstInput.vue'

function initState () {
  return {
    text: '',
  }
}
</script>

<template>
  <Story title="HstInput">
    <Variant
      title="playground"
      :init-state="initState"
    >
      <template #default="{ state }">
        <HstInput
          v-model="state.text"
        >
          Label
        </HstInput>
      </template>

      <template #controls="{ state }">
        <HstInput
          v-model="state.text"
        >
          Label
        </HstInput>
      </template>
    </Variant>

    <Variant
      title="no-label"
      :init-state="initState"
    >
      <template #default="{ state }">
        <HstInput
          v-model="state.text"
          placeholder="Enter some text..."
        />
      </template>

      <template #controls="{ state }">
        <HstInput
          v-model="state.text"
        >
          Label
        </HstInput>
      </template>
    </Variant>
  </Story>
</template>
