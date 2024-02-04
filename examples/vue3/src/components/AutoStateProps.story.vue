<script lang="ts" setup>
import AutoStateProps from './AutoStateProps.vue'

function initState () {
  return {
    name: 'Fry',
  }
}
</script>

<template>
  <Story
    title="Auto State & Props"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant title="Naked">
      <AutoStateProps />
    </Variant>
    <Variant
      title="State"
      :init-state="initState"
    >
      <template #default="{ state }">
        <AutoStateProps :name="state.name" />
      </template>
    </Variant>
  </Story>
</template>
