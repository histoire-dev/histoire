<script lang="ts" setup>
import { reactive } from 'vue'

const options = [
  { label: 'Crash Bandicoot', value: 'crash-bandicoot' },
  { label: 'The Last of Us', value: 'the-last-of-us' },
  { label: 'Ghost of Tsushima', value: 'ghost-of-tsushima' },
]

const state = reactive({
  text: 'Hello',
  checkbox: false,
  number: 20,
  longText: 'Longer text...',
  select: 'crash-bandicoot',
  colorselect: '#000000',
  fn: () => { /* noop */ },
})

defineExpose({
  state,
})
</script>

<template>
  <Story
    title="Variant-scoped Controls"
    :layout="{ type: 'grid', width: 280 }"
  >
    <template #controls>
      <HstText
        v-model="state.text"
        title="HstText"
      />
      <HstCheckbox
        v-model="state.checkbox"
        title="HstCheckbox"
      />
      <HstNumber
        v-model="state.number"
        title="HstNumber"
      />
      <HstTextarea
        v-model="state.longText"
        title="HstTextarea"
      />
      <HstSelect
        v-model="state.select"
        title="HstSelect"
        :options="options"
      />
      <HstColorSelect
        v-model="state.colorselect"
        title="HstColorSelect"
      />
    </template>

    <Variant
      title="variant 1"
    >
      <h1>Variant 1</h1>
      <pre data-test-id="shared-controls-state">{{ state }}</pre>
    </Variant>

    <Variant
      title="variant 2"
    >
      <h1>Variant 2</h1>
      <pre data-test-id="shared-controls-state">{{ state }}</pre>
    </Variant>

    <Variant
      title="variant 3"
    >
      <h1>Variant 3</h1>
      <pre data-test-id="shared-controls-state">{{ state }}</pre>
    </Variant>
  </Story>
</template>
