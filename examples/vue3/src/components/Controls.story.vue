<script lang="ts" setup>
const options = {
  'crash-bandicoot': 'Crash Bandicoot',
  'the-last-of-us': 'The Last of Us',
  'ghost-of-tsushima': 'Ghost of Tsushima',
}

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
