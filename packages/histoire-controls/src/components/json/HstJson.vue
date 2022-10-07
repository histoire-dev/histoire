<script lang="ts">
export default {
  name: 'HstJson',
  inheritAttrs: false,
}
</script>

<script lang="ts" setup>
import { ref, watch } from 'vue'
import HstWrapper from '../HstWrapper.vue'

const props = defineProps<{
  title?: string
  modelValue: any
}>()

const emits = defineEmits({
  'update:modelValue': (newValue: string) => true,
})

const internalValue = ref('')

watch(() => props.modelValue, () => {
  internalValue.value = JSON.stringify(props.modelValue)
}, { immediate: true })

function emitInput (event: InputEvent) {
  try {
    emits('update:modelValue', JSON.parse((event.target as HTMLInputElement).value))
  } catch (e) { }
}

const input = ref<HTMLInputElement>()
</script>

<template>
  <HstWrapper
    :title="title"
    class="htw-cursor-text"
    :class="$attrs.class"
    :style="$attrs.style"
    @click="input.focus()"
  >
    <textarea
      ref="input"
      v-bind="{ ...$attrs, class: null, style: null }"
      :value="internalValue"
      class="htw-text-inherit htw-bg-transparent htw-w-full htw-outline-none htw-px-2 htw-py-1 -htw-my-1 htw-border htw-border-solid htw-border-black/25 dark:htw-border-white/25 focus:htw-border-primary-500 dark:focus:htw-border-primary-500 htw-rounded-sm htw-box-border htw-resize-y htw-min-h-[26px]"
      @input="emitInput"
    />

    <template #actions>
      <slot name="actions" />
    </template>
  </HstWrapper>
</template>
