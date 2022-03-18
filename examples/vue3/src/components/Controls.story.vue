<script lang="ts" setup>
function initState () {
  return {
    text: 'Hello',
    checkbox: false,
    number: 20,
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
          integer
        />
      </template>
    </Variant>
  </Story>
</template>
