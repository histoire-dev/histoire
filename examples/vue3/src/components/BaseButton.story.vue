<script lang="ts" setup>
import BaseButton from './BaseButton.vue'

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
      title="playground"
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
      <BaseButton
        color="green"
        size="big"
      >
        Click me
      </BaseButton>
    </Variant>

    <Variant
      title="small red button"
      icon-color="#F43F5E"
    >
      <BaseButton
        color="red"
        size="small"
      >
        Click me!
      </BaseButton>
    </Variant>
  </Story>
</template>
