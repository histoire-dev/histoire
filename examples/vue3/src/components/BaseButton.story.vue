<script lang="ts" setup>
import type { DesignInput } from '@histoire/plugin-designs'
import BaseButton from './BaseButton.vue'

// Functions, unlike top-level arrays, are not picked up as editable story state.

/** Designs shown for every variant without its own. */
function storyDesigns(): DesignInput[] {
  return [
    { type: 'figma', url: 'https://www.figma.com/design/Ec8YaGOIquk1Ie3UzVaJia/Untitled?node-id=0-1' },
    { type: 'image', name: 'Spec', url: '/designs/base-button.svg' },
  ]
}

/** Designs of the small red button: zoomed spec, an embedded page and a plain link. */
function smallRedDesigns(): DesignInput[] {
  return [
    { type: 'image', name: 'Spec', url: '/designs/base-button.svg', scale: 2 },
    { type: 'iframe', name: 'Guidelines', url: 'https://histoire.dev/' },
    { type: 'link', url: 'https://github.com/histoire-dev/histoire', label: 'Source repository' },
  ]
}

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
    :meta="{ wrapper: false, design: storyDesigns() }"
    title="BaseButton"
    :layout="{ type: 'grid' }"
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
      :meta="{ design: smallRedDesigns() }"
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
