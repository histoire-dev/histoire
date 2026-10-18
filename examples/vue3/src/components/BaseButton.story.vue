<script lang="ts" setup>
import BaseButton from './BaseButton.vue'

/** Creates independent editable values for each variant. */
function initState() {
  return {
    disabled: false,
    color: undefined,
    size: undefined,
  }
}
</script>

<template>
  <Story
    :meta="{ wrapper: false }"
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
            :color="state.color"
            :size="state.size"
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
        <HstSelect
          v-model="state.color"
          title="Color"
          :options="[
            { value: undefined, label: 'Default' },
            { value: 'green', label: 'Green' },
            { value: 'red', label: 'Red' },
          ]"
        />
        <HstSelect
          v-model="state.size"
          title="Size"
          :options="[
            { value: undefined, label: 'Default' },
            { value: 'small', label: 'Small' },
            { value: 'big', label: 'Big' },
          ]"
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
