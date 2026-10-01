<script lang="ts">
export default {
  name: 'CustomSelect',
}
</script>

<script lang="ts" setup>
import type { HistoireControlsOverlayHandle } from '@histoire/shared'
import type { ComputedRef } from 'vue'
import type { HstControlOption } from '../../types'
import { getControlsHost } from '@histoire/shared'
import { Icon } from '@iconify/vue'
import { Dropdown as VDropdown } from 'floating-vue'
import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import { restoreControlsFocus } from '../../overlay/focus'

const props = defineProps<{
  /** Actual selected value, retained inside the story runtime. */
  modelValue?: any
  /** Accessible label forwarded to the host listbox. */
  title?: string
  /** Local values and their visible labels. */
  options: Record<string, any> | string[] | number[] | HstControlOption[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
}>()

const formattedOptions: ComputedRef<[any, string][]> = computed(() => {
  if (Array.isArray(props.options)) {
    return props.options.map((option) => {
      if (typeof option === 'string' || typeof option === 'number') {
        return [option, String(option)] as [any, string]
      }
      else {
        return [option.value, option.label] as [any, string]
      }
    })
  }
  else {
    return Object.entries(props.options)
  }
})

const selectedLabel = computed(() => formattedOptions.value.find(([value]) => value === props.modelValue)?.[1])

/** Host adapter exists only in the dedicated controls sandbox. */
const host = getControlsHost()
const anchor = ref<HTMLButtonElement | null>(null)
const opened = ref(false)
let overlay: HistoireControlsOverlayHandle | undefined
/** Stable IDs retain their meaning when options reorder while a menu is open. */
const optionIds = new Map<unknown, string>()
const localOptions = new Map<string, any>()

/** Creates labels and opaque IDs without cloning the actual option values. */
function getOverlay() {
  localOptions.clear()
  const items = formattedOptions.value.map(([value, label]) => {
    const raw = toRaw(value)
    if (!optionIds.has(raw)) optionIds.set(raw, String(optionIds.size))
    const id = optionIds.get(raw)!
    localOptions.set(id, value)
    return { id, label: String(label) }
  })
  return {
    kind: 'select' as const,
    label: props.title,
    items,
    selectedId: optionIds.get(toRaw(props.modelValue)),
  }
}

/** Opens or toggles a host dropdown; its callback resolves values in this runtime. */
function open() {
  if (!host || !anchor.value) return
  if (opened.value) {
    overlay?.close()
    overlay = undefined
    opened.value = false
    return
  }
  opened.value = true
  overlay = host.open(anchor.value, getOverlay(), (result) => {
    overlay = undefined
    opened.value = false
    if (result.itemId !== undefined && localOptions.has(result.itemId)) emit('update:modelValue', localOptions.get(result.itemId))
    restoreControlsFocus(anchor.value, result)
  })
}

/** Allows keyboard users to open the host listbox with either arrow key. */
function onKeydown(event: KeyboardEvent) {
  if (host && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault()
    if (!opened.value) open()
  }
}

watch(getOverlay, value => overlay?.update(value), { deep: true })
onBeforeUnmount(() => overlay?.close())

/** Selects an option when rendered outside the controls sandbox. */
function selectValue(value: any, hide: () => void) {
  emit('update:modelValue', value)
  hide()
}
</script>

<template>
  <component
    :is="host ? 'div' : VDropdown"
    v-bind="host ? {} : { autoSize: true, autoBoundaryMaxSize: true }"
  >
    <button
      ref="anchor"
      type="button"
      aria-haspopup="listbox"
      :aria-expanded="host ? opened : undefined"
      :aria-label="title"
      class="htw-text-inherit htw-text-left htw-bg-transparent htw-cursor-pointer htw-w-full htw-outline-none htw-px-2 htw-h-[27px] -htw-my-1 htw-border htw-border-solid htw-border-black/25 dark:htw-border-white/25 hover:htw-border-primary-500 dark:hover:htw-border-primary-500 focus-visible:htw-border-primary-500 htw-rounded-sm htw-flex htw-gap-2 htw-items-center htw-leading-normal"
      @click="open"
      @keydown="onKeydown"
    >
      <div class="htw-flex-1 htw-truncate">
        <slot :label="selectedLabel">
          {{ selectedLabel }}
        </slot>
      </div>
      <Icon
        icon="carbon:chevron-sort"
        class="htw-w-4 htw-h-4 htw-flex-none htw-ml-auto"
      />
    </button>
    <template #popper="{ hide }">
      <div class="htw-flex htw-flex-col htw-bg-gray-50 dark:htw-bg-gray-700">
        <div
          v-for="[value, label] of formattedOptions"
          v-bind="{ ...$attrs, class: null, style: null }"
          :key="label"
          class="htw-px-2 htw-py-1 htw-cursor-pointer hover:htw-bg-primary-100 dark:hover:htw-bg-primary-700"
          :class="{
            'htw-bg-primary-200 dark:htw-bg-primary-800': props.modelValue === value,
          }"
          @click="selectValue(value, hide)"
        >
          {{ label }}
        </div>
      </div>
    </template>
  </component>
</template>
