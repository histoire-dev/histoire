<script lang="ts" setup>
import { defineAsyncComponent } from 'vue'

const BaseButton = defineAsyncComponent(() => import('./BaseButton.vue'))

function initState () {
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
      title="default"
      :init-state="initState"
    >
      <template #default="{ state }">
        <BaseButton
          :disabled="state.disabled"
        >
          Click me
        </BaseButton>
      </template>

      <template #controls="{ state }">
        <div>
          <label>
            <input
              v-model="state.disabled"
              type="checkbox"
            >
            Disabled
          </label>
        </div>
      </template>
    </Variant>

    <Variant title="big green button">
      <BaseButton
        color="green"
        size="big"
      >
        Click me
      </BaseButton>
    </Variant>

    <Variant title="small red button">
      <BaseButton
        color="red"
        size="small"
      >
        Click me!
      </BaseButton>
    </Variant>
  </Story>
</template>
