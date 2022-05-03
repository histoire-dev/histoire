<script lang="ts" setup>
const options = [
  { label: 'Crash Bandicoot', value: 'crash-bandicoot' },
  { label: 'The Last of Us', value: 'the-last-of-us' },
  { label: 'Ghost of Tsushima', value: 'ghost-of-tsushima' },
]
function initState () {
  return {
    text: 'Hello',
    checkbox: false,
    number: 20,
    longText: 'Longer text...',
    select: 'crash-bandicoot',
  }
}
</script>

<template>
  <Story title="Controls">
    <Variant
      title="default"
      :init-state="initState"
    >
      <template #default="{ state }">
        <h1>State</h1>
        <pre>{{ state }}</pre>
      </template>

      <template #controls="{ state }">
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
