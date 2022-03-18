<script lang="ts" setup>
import HstNumber from './HstNumber.vue'

function initState () {
  return {
    count: 20,
  }
}
</script>

<template>
  <Story
    title="HstNumber"
    :layout="{
      type: 'grid',
      width: '100%',
    }"
  >
    <Variant
      title="default"
      :init-state="initState"
    >
      <template #default="{ state }">
        <HstNumber
          v-model="state.count"
          title="Count"
        />
      </template>

      <template #controls="{ state }">
        <HstNumber
          v-model="state.count"
          title="Count"
        />
      </template>
    </Variant>

    <Variant
      title="integer"
      :init-state="initState"
    >
      <template #default="{ state }">
        <HstNumber
          v-model="state.count"
          title="Count"
          integer
        />
      </template>

      <template #controls="{ state }">
        <HstNumber
          v-model="state.count"
          title="Count"
          integer
        />
      </template>
    </Variant>
  </Story>
</template>
