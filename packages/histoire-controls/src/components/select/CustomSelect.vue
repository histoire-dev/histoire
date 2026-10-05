<script setup lang="ts">
import type { HistoireControlsOverlayHandle } from '@histoire/shared'
import type { HstControlOptions } from '../../options'
import { getControlsHost } from '@histoire/shared'
import { Dropdown as VDropdown } from 'floating-vue'
import { computed, nextTick, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import { useHistoireControls } from '../../context'
import { normalizeControlOptions } from '../../options'
import { focusControlsSelectedOption, moveControlsOptionFocus, reconcileControlsOptionFocus, restoreControlsFocus } from '../../overlay/focus'
import { useControlsTheme } from '../../utils'
import BuiltinIcon from '../BuiltinIcon.vue'
import HstButton from '../button/HstButton.vue'

defineOptions({ name: 'CustomSelect', inheritAttrs: false })
const props = defineProps<{
  /** Actual value never leaves its owning runtime. */
  modelValue?: any
  /** Accessible name. */
  title?: string
  /** Visible choices with original values and availability. */
  options: HstControlOptions
  /** Disable opening and selection while owner is busy. */
  disabled?: boolean
  /** Displayed when current value has no matching option. */
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: any] }>()
const options = computed(() => normalizeControlOptions(props.options))
const selectedLabel = computed(() => options.value.find(option => Object.is(toRaw(option.value), toRaw(props.modelValue)))?.label)
const host = getControlsHost()
const controls = useHistoireControls()
const dark = useControlsTheme()
const anchor = ref<HTMLButtonElement>()
const list = ref<HTMLElement>()
const opened = ref(false)
let overlay: HistoireControlsOverlayHandle | undefined
const optionIds = new Map<unknown, string>()
const localOptions = new Map<string, { value: any, disabled?: boolean }>()

/** Stable opaque IDs preserve values and availability across reorders. */
function getOverlay() {
  localOptions.clear()
  const items = options.value.map((option) => {
    const raw = toRaw(option.value)
    if (!optionIds.has(raw)) optionIds.set(raw, String(optionIds.size))
    const id = optionIds.get(raw)!
    localOptions.set(id, option)
    return { id, label: option.label, ...(option.disabled ? { disabled: true } : {}) }
  })
  const selectedId = optionIds.get(toRaw(props.modelValue))
  return { kind: 'select' as const, items, ...(props.title === undefined ? {} : { label: props.title }), ...(selectedId === undefined ? {} : { selectedId }) }
}
/** Public focus handle points at actual trigger. */
function focus(): void {
  if (!props.disabled) anchor.value?.focus()
}
defineExpose({ focus })
/** Dismiss without taking keyboard focus unless caller requested it. */
function close(restore = false): void {
  opened.value = false
  const current = overlay
  overlay = undefined
  current?.close()
  if (restore) focus()
}
/** Both render modes use same explicit open state. */
function open(): void {
  if (props.disabled || !options.value.length || !anchor.value) return
  if (opened.value) {
    close(true)
    return
  }
  opened.value = true
  if (host) {
    overlay = host.open(anchor.value, getOverlay(), (result) => {
      overlay = undefined
      opened.value = false
      const option = result.itemId === undefined ? undefined : localOptions.get(result.itemId)
      if (option && !option.disabled && !props.disabled) emit('update:modelValue', option.value)
      restoreControlsFocus(anchor.value, result)
    })
  }
  else {
    // Rapid reopening can retain FloatingVue shell before its hide timer runs.
    void focusSelected()
  }
}
/** Local dropdown focuses selected enabled option after real popper mount. */
async function focusSelected(): Promise<void> {
  await nextTick()
  if (!opened.value) return
  focusControlsSelectedOption(list.value ?? null)
}
/** Native button handles Enter/Space; arrow keys open menu explicitly. */
function onKeydown(event: KeyboardEvent): void {
  if (opened.value && event.key === 'Escape') {
    event.preventDefault()
    close(true)
  }
  else if (opened.value && event.key === 'Tab') {
    close()
  }
  else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!opened.value) open()
  }
}
/** Tab resumes native traversal from trigger; Escape returns trigger focus. */
function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    close()
    restoreControlsFocus(anchor.value, { restoreFocus: true, ...(event.key === 'Tab' ? { focusDirection: event.shiftKey ? 'previous' : 'next' } : {}) })
  }
  else {
    moveControlsOptionFocus(list.value ?? null, event)
  }
}
/** Local slots change presentation only; values remain exact. */
function select(index: number): void {
  const option = options.value[index]
  if (!option || props.disabled || option.disabled) return
  emit('update:modelValue', option.value)
  close(true)
}
watch(getOverlay, value => overlay?.update(value), { deep: true })
watch(() => props.disabled, (value) => {
  if (value) close()
})
watch(options, () => {
  if (!opened.value) return
  if (!options.value.length) return close(true)
  if (host) return
  void nextTick().then(() => {
    if (opened.value) reconcileControlsOptionFocus(list.value ?? null)
  })
}, { deep: true })
onBeforeUnmount(() => close())
</script>

<template>
  <component :is="host ? 'span' : VDropdown" v-bind="host ? {} : { shown: opened, triggers: [], autoSize: true, autoBoundaryMaxSize: true, noAutoFocus: true, ...(controls ? { container: controls.overlay.value ?? false } : {}) }" @apply-show="focusSelected" @hide="close()">
    <button ref="anchor" v-bind="$attrs" type="button" aria-haspopup="listbox" :aria-expanded="opened" :aria-label="($attrs['aria-label'] as string | undefined) ?? title" :disabled="disabled" class="histoire-select-trigger" @click="open" @keydown="onKeydown">
      <span class="histoire-select-value"><slot :label="selectedLabel">{{ selectedLabel ?? placeholder }}</slot></span>
      <BuiltinIcon icon="carbon:chevron-down" width="16" height="16" />
    </button>
    <template #popper>
      <div ref="list" role="listbox" :aria-label="($attrs['aria-label'] as string | undefined) ?? title ?? 'Options'" class="histoire-control-menu" :data-histoire-control-appearance="dark ? 'dark' : 'light'" @keydown="onMenuKeydown">
        <HstButton v-for="(option, index) in options" :key="index" color="flat" role="option" :disabled="option.disabled" :aria-selected="Object.is(toRaw(option.value), toRaw(modelValue))" @click="select(index)">
          <slot name="option" :label="option.label" :value="option.value">
            {{ option.label }}
          </slot>
        </HstButton>
      </div>
    </template>
  </component>
</template>
