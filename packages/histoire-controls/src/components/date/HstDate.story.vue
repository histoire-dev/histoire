<script lang="ts" setup>
import HstDate from './HstDate.vue'

function initState() {
  return {
    label: 'My really long label',
    text: '',
  }
}
</script>

<template>
  <Story
    title="HstDate"
    group="controls"
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
        <HstDate
          v-model="state.text"
          :title="state.label"
        />
      </template>

      <template #controls="{ state }">
        <HstDate
          v-model="state.label"
          title="Label"
        />
        <HstDate
          v-model="state.text"
          title="Text"
        />
      </template>
    </Variant>

    <Variant
      title="no-label"
      :init-state="initState"
    >
      <template #default="{ state }">
        <HstDate
          v-model="state.text"
          placeholder="Enter some text..."
        />
      </template>

      <template #controls="{ state }">
        <HstDate
          v-model="state.text"
          title="Text"
        />
      </template>
    </Variant>
  </Story>
</template>
