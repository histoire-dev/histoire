<script lang="ts" setup>
import HstSelect from './HstSelect.vue'

const options = [
  { label: 'Crash Bandicoot', value: 'crash-bandicoot' },
  { label: 'The Last of Us', value: 'the-last-of-us' },
  { label: 'Ghost of Tsushima', value: 'ghost-of-tsushima' },
]

const flatOptions = options.map(option => option.label)

function initState () {
  return {
    label: 'My really long label',
    select: 'crash-bandicoot',
  }
}
</script>

<template>
  <Story
    title="HstSelect"
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
        <HstSelect
          v-model="state.select"
          :title="state.label"
          :options="options"
        />
      </template>

      <template #controls="{ state }">
        <HstSelect
          v-model="state.select"
          title="Select"
          :options="options"
        />
      </template>
    </Variant>

    <Variant
      title="no-label"
      :init-state="initState"
    >
      <template #default="{ state }">
        <HstSelect
          v-model="state.select"
          :options="options"
        />
      </template>
      <template #controls="{ state }">
        <HstSelect
          v-model="state.select"
          title="Select"
          :options="options"
        />
      </template>
    </Variant>

    <Variant
      title="options-as-array-of-objects"
      :init-state="initState"
    >
      <template #default="{ state }">
        <pre class="htw-text-xs htw-bg-gray-50 dark:htw-bg-gray-600 htw-rounded htw-p-4">{{ options }}</pre>
        <HstSelect
          v-model="state.select"
          title="Games"
          :options="options"
        />
      </template>
      <template #controls="{ state }">
        <HstSelect
          v-model="state.select"
          title="Games"
          :options="options"
        />
      </template>
    </Variant>

    <Variant
      title="options-as-array-of-strings"
      :init-state="initState"
    >
      <template #default="{ state }">
        <pre class="htw-text-xs htw-bg-gray-50 dark:htw-bg-gray-600 htw-rounded htw-p-4">{{ flatOptions }}</pre>
        <HstSelect
          v-model="state.select"
          title="Select"
          :options="flatOptions"
        />
      </template>
      <template #controls="{ state }">
        <HstSelect
          v-model="state.select"
          title="Select"
          :options="flatOptions"
        />
      </template>
    </Variant>
  </Story>
</template>
