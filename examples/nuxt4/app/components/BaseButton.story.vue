<script lang="ts" setup>
import BaseButton from './BaseButton.vue'

/** Creates independent playground state. */
function initState() {
  return {
    disabled: false,
  }
}
</script>

<template>
  <Story
    title="BaseButton"
    :layout="{
      type: 'grid',
      width: 200,
    }"
  >
    <Variant
      title="playground"
      :init-state="initState"
    >
      <template #default="{ state }">
        <div class="example-stage">
          <BaseButton
            class="example-button"
            :disabled="state.disabled"
          >
            Click me
          </BaseButton>
        </div>
      </template>

      <template #controls="{ state }">
        <HstCheckbox
          v-model="state.disabled"
          title="Disabled"
        />
      </template>
    </Variant>

    <Variant
      title="big green button"
      icon="el:resize-full"
    >
      <div class="example-stage">
        <BaseButton
          class="example-button"
          color="green"
          size="big"
        >
          Click me
        </BaseButton>
      </div>
    </Variant>

    <Variant
      title="small red button"
      icon-color="#F43F5E"
    >
      <div class="example-stage">
        <BaseButton
          class="example-button"
          color="red"
          size="small"
        >
          Click me!
        </BaseButton>
      </div>
    </Variant>
  </Story>
</template>
