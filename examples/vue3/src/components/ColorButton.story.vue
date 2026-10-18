<script lang="ts" setup>
import ColorButton from './ColorButton.vue'

/** Creates independent editable values for each variant. */
function initState() {
  return {
    bgcolorselect: '#000000',
    txtcolorselect: '#ffffff',
  }
}
</script>

<template>
  <Story
    :meta="{ wrapper: false }"
    title="Color Button"
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
          <ColorButton
            class="example-button"
            :bgcolorselect="state.bgcolorselect"
            :txtcolorselect="state.txtcolorselect"
          >
            Click me
          </ColorButton>
        </div>
      </template>

      <template #controls="{ state }">
        <HstColorSelect
          v-model="state.bgcolorselect"
          title="Background Color Select"
        />
        <HstColorSelect
          v-model="state.txtcolorselect"
          title="Text Color Select"
        />
      </template>
    </Variant>
  </Story>
</template>
