<script lang="ts" setup>
import { reactive } from 'vue'

const options = {
  'crash-bandicoot': 'Crash Bandicoot',
  'the-last-of-us': 'The Last of Us',
  'ghost-of-tsushima': 'Ghost of Tsushima',
}

const state = reactive({
  text: 'Hello',
  checkbox: false,
  number: 20,
  longText: 'Longer text...',
  select: 'crash-bandicoot',
})
</script>

<template>
  <Story title="Controls">
    <Variant
      title="default"
    >
      <template #default>
        <h1>State</h1>
        <pre>{{ state }}</pre>
      </template>

      <template #controls>
        <HstPresets
          id="controls"
          :state="state"
        />
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
      </template>
    </Variant>
  </Story>
</template>
