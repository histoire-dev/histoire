<script lang="ts" setup>
import Autoprops from './Autoprops.vue'

function initState () {
  return {
    name: 'Fry',
  }
}
</script>

<template>
  <Story
    title="Autoprops"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant title="Naked">
      <Autoprops />
    </Variant>
    <Variant
      title="State"
      :init-state="initState"
    >
      <template #default="{ state }">
        <Autoprops :name="state.name" />
      </template>
    </Variant>
  </Story>
</template>
