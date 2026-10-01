<script lang="ts" setup>
/**
 * Creates variant-scoped state with one detected field.
 */
function initSingleFieldState() {
  return {
    label: 'alpha',
  }
}

/**
 * Creates variant-scoped state with two detected fields.
 */
function initTwoFieldState() {
  return {
    label: 'bravo',
    enabled: true,
  }
}

/**
 * Creates variant-scoped state with three detected fields.
 */
function initThreeFieldState() {
  return {
    label: 'charlie',
    enabled: false,
    count: 3,
  }
}
</script>

<template>
  <Story
    title="Detected State Pane"
    :layout="{ type: 'grid', width: 260 }"
  >
    <Variant
      title="single field"
      :init-state="initSingleFieldState"
    >
      <template #default="{ state }">
        <pre data-test-id="detected-state-pane-preview">{{ state }}</pre>
      </template>
    </Variant>

    <Variant
      title="two fields"
      :init-state="initTwoFieldState"
    >
      <template #default="{ state }">
        <pre data-test-id="detected-state-pane-preview">{{ state }}</pre>
      </template>
    </Variant>

    <Variant
      title="three fields"
      :init-state="initThreeFieldState"
    >
      <template #default="{ state }">
        <pre data-test-id="detected-state-pane-preview">{{ state }}</pre>
      </template>
    </Variant>
  </Story>
</template>
