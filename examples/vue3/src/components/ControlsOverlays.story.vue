<script lang="ts" setup>
/** Long menu exercises host placement independently of controls form height. */
const options = Array.from({ length: 50 }, (_, value) => ({ value, label: `Option ${value}` }))

/** State synchronized between controls sandbox and preview. */
function initState() {
  return { expanded: true, text: 'Example', selected: 0 }
}
</script>

<template>
  <Story title="Controls overlays">
    <Variant :init-state="initState">
      <template #default="{ state }">
        <pre data-test-id="overlay-state">{{ { expanded: state.expanded, text: state.text, selected: state.selected } }}</pre>
      </template>
      <template #controls="{ state }">
        <HstCheckbox v-model="state.expanded" title="Extra controls" />
        <template v-if="state.expanded">
          <HstText v-model="state.text" title="Text" />
          <HstTextarea v-model="state.text" title="Long text" />
        </template>
        <HstSelect v-model="state.selected" title="Option" :options="options" />
      </template>
    </Variant>
  </Story>
</template>
