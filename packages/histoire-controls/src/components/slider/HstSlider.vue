<script lang="ts">
export default {
  name: 'HstSlider',
  inheritAttrs: false,
}
</script>

<script lang="ts" setup>
import type { CSSProperties } from 'vue'
import type { HstControlLayout } from '../../types'
import { computed, ref } from 'vue'
import { useControlField } from '../../field'
import { VTooltip as vTooltip } from '../../overlay/tooltip'
import HstWrapper from '../HstWrapper.vue'

const props = defineProps<{
  /** Shared label placement. */
  layout?: HstControlLayout
  title?: string
  modelValue?: number | null
  min: number
  max: number
}>()

const emit = defineEmits({
  'update:modelValue': (newValue: number) => true,
})

const showTooltip = ref(false)
const input = ref<HTMLInputElement>()

const { attrs, id, fieldAttrs, focus } = useControlField(input, () => props.title)
defineExpose({ focus, element: input })

const numberModel = computed({
  get: () => props.modelValue,
  set: (value) => {
    emit('update:modelValue', value)
  },
})

const percentage = computed(() => {
  return props.max === props.min ? 0 : ((props.modelValue ?? props.min) - props.min) / (props.max - props.min)
})

const tooltipStyle = computed<CSSProperties>(() => {
  const gap = 8
  if (input.value) {
    const position = gap + ((input.value.clientWidth - 2 * gap) * percentage.value)
    return {
      left: `${position}px`,
    }
  }
  return {}
})
</script>

<template>
  <HstWrapper
    class="histoire-slider"
    :title="title"
    :control-id="id()"
    :data-histoire-control-type="attrs['data-histoire-control-type']"
    :layout="layout"
    :class="$attrs.class"
    :style="$attrs.style"
  >
    <div class="htw-relative htw-w-full htw-flex htw-items-center">
      <div class="htw-absolute htw-inset-0 htw-flex htw-items-center">
        <div class="histoire-slider-track" />
      </div>
      <input
        ref="input"
        v-model.number="numberModel"
        class="htw-range-input htw-appearance-none htw-border-0 htw-bg-transparent htw-cursor-pointer htw-relative htw-w-full htw-m-0 htw-text-gray-700"
        type="range"
        v-bind="{ ...fieldAttrs(), min, max }"
        @mouseover="showTooltip = true"
        @mouseleave="showTooltip = false"
      >
      <div
        v-if="showTooltip"
        v-tooltip="{ content: String(modelValue ?? ''), shown: true, distance: 16, delay: 0 }"
        class="htw-absolute"
        :style="tooltipStyle"
      />
    </div>
  </HstWrapper>
</template>

<style lang="pcss">
.histoire-slider-track { height: 4px; width: 100%; border-radius: 4px; background: var(--histoire-control-resolved-border); }
.htw-range-input {
  min-height: var(--histoire-control-height, 34px);
  &::-webkit-slider-thumb {
    appearance: none; width: 14px; height: 14px; background: var(--histoire-control-resolved-surface); border: 1px solid var(--histoire-control-resolved-border); border-radius: 50%;
  }

  &:hover::-webkit-slider-thumb {
    background: var(--histoire-control-resolved-accent); border-color: var(--histoire-control-resolved-accent);
  }
}

/* Separate rules for -moz-range-thumb to prevent a bug with Safari that causes it to ignore custom style */

.htw-range-input {
  &::-moz-range-thumb {
    appearance: none; width: 14px; height: 14px; background: var(--histoire-control-resolved-surface); border: 1px solid var(--histoire-control-resolved-border); border-radius: 50%;
  }

  &:hover::-moz-range-thumb {
    background: var(--histoire-control-resolved-accent); border-color: var(--histoire-control-resolved-accent);
  }
}
</style>
