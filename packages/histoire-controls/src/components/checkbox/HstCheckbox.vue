<script lang="ts">
export default {
  name: 'HstCheckbox',
}
</script>

<script lang="ts" setup>
import HstWrapper from '../HstWrapper.vue'
import HstSimpleCheckbox from './HstSimpleCheckbox.vue'

const props = defineProps<{
  modelValue: boolean
  title?: string
}>()

const emits = defineEmits({
  'update:modelValue': (newValue: boolean) => true,
})

function toggle () {
  emits('update:modelValue', !props.modelValue)
}
</script>

<template>
  <HstWrapper
    role="checkbox"
    tabindex="0"
    class="htw-cursor-pointer htw-items-center"
    :title="title"
    @click="toggle()"
    @keydown.enter.prevent="toggle()"
    @keydown.space.prevent="toggle()"
  >
    <HstSimpleCheckbox :model-value="modelValue" />
    <template #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
