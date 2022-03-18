<script lang="ts" setup>
function initState () {
  return {
    input: 'Hello',
    checkbox: false,
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
        <HstInput
          v-model="state.input"
          title="HstInput"
        />
        <HstCheckbox
          v-model="state.checkbox"
          title="HstCheckbox"
        />
      </template>
    </Variant>
  </Story>
</template>
