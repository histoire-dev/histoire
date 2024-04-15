<script lang="ts" setup>
import HstCheckbox from './HstCheckbox.vue'

function initState() {
  return {
    booleanChecked: false,
    stringChecked: 'false',
  }
}
</script>

<template>
  <Story
    title="HstCheckbox"
    group="controls"
  >
    <Variant
      title="playground"
      :init-state="initState"
    >
      <template #default="{ state }">
        <HstCheckbox
          v-model="state.booleanChecked"
          title="Boolean"
        />
        {{ { value: state.booleanChecked } }}
        <HstCheckbox
          v-model="state.stringChecked"
          title="String"
        />
        {{ { value: state.stringChecked } }}
      </template>

      <template #controls="{ state }">
        <HstCheckbox
          v-model="state.booleanChecked"
          title="Boolean"
        />
        <HstCheckbox
          v-model="state.stringChecked"
          title="String"
        />
      </template>
    </Variant>
  </Story>
</template>
