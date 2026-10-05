<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { PopoverBoundary } from '../popover/position.js'
import { restoreControlsFocus } from '@histoire/controls/vue'
import { inject, nextTick, onBeforeUnmount, provide, ref, shallowReactive, shallowRef } from 'vue'
import ToolbarButton from '../../canvas/toolbar/ToolbarButton.vue'
import BasePopover from '../popover/BasePopover.vue'
import { closePopoverChildren, createPopoverScope, popoverScopeKey } from '../popover/scope.js'
import { overflowToolbarKey } from './context.js'
import { useOverflowLayout } from './layout.js'

const props = defineProps<{
  /** Accessible toolbar name. */
  label: string
  /** Accessible dropdown trigger and panel name. */
  overflowLabel: string
  /** Surface-owned portal target; body is fallback for ordinary app usage. */
  overlayTarget?: HTMLElement | string | null
  /** Surface bounds excluding unavailable chrome. */
  bounds?: PopoverBoundary
}>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const root = shallowRef<HTMLElement | null>(null)
const trigger = shallowRef<HTMLElement | null>(null)
const open = ref(false)
const focusLast = ref(false)
let active = true
onBeforeUnmount(() => {
  active = false
})
const scope = createPopoverScope(inject(popoverScopeKey, undefined))
provide(popoverScopeKey, scope)
const hosts = shallowReactive(new Map<string, HTMLElement>())
const layout = useOverflowLayout(root, trigger, scope, () => open.value, () => close())
const { items, overflowing } = layout
provide(overflowToolbarKey, { hosts, register: layout.register, measure: layout.measure, close, reveal: () => show(false), bounds: () => typeof props.bounds === 'function' ? props.bounds() : props.bounds })

/** Native element ref bypasses component internals while preserving button instance. */
function setTrigger(element: Element | ComponentPublicInstance | null): void {
  trigger.value = element && '$el' in element ? element.$el : element as HTMLElement | null
}

/** Stable target per group keeps overflow order independent of teleport timing. */
function setHost(id: string, element: Element | ComponentPublicInstance | null): void {
  if (element instanceof HTMLElement) hosts.set(id, element)
  else hosts.delete(id)
}

/** Manual opening dismisses existing tool panels; shortcut revelation preserves child. */
function show(manual = true, last = false): void {
  if (!overflowing.value) return
  if (manual) closePopoverChildren(scope)
  focusLast.value = last
  open.value = true
  emit('update:open', true)
}

/** Close descendants first; focus restoration is explicit and caller-owned. */
function close(restore = false): void {
  if (!open.value) return
  closePopoverChildren(scope)
  open.value = false
  emit('update:open', false)
  if (restore) trigger.value?.focus({ preventScroll: true })
}

/** Dropdown keys never leak into canvas shortcuts. */
function triggerKey(event: KeyboardEvent): void {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
  event.preventDefault()
  event.stopPropagation()
  show(true, event.key === 'ArrowUp')
}

/** Navigate only this menu's enabled rows, leaving child-panel input untouched. */
function keyboard(event: KeyboardEvent): void {
  const menu = event.currentTarget as HTMLElement
  if (event.key === 'Tab') {
    event.preventDefault()
    event.stopPropagation()
    close()
    void nextTick().then(() => {
      if (active && !open.value) restoreControlsFocus(trigger.value, { restoreFocus: true, focusDirection: event.shiftKey ? 'previous' : 'next' })
    })
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(button => !button.closest('[hidden]'))
  if (!buttons.length) return
  event.preventDefault()
  event.stopPropagation()
  const current = buttons.indexOf(menu.ownerDocument.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next]?.focus()
  buttons[next]?.scrollIntoView?.({ block: 'nearest' })
}
</script>

<template>
  <div ref="root" class="histoire-overflow-toolbar" role="toolbar" :aria-label="label">
    <div class="overflow-toolbar-items">
      <slot />
    </div>
    <ToolbarButton :ref="setTrigger" class="overflow-toolbar-trigger" :hidden="!overflowing" :label="overflowLabel" icon="chevron-down" aria-haspopup="menu" :aria-expanded="open" @click="open ? close(true) : show()" @keydown="triggerKey" />
    <BasePopover class="overflow-toolbar-popover" :open="open" :anchor="trigger" :label="overflowLabel" role="menu" :scope="scope" :overlay-target="props.overlayTarget" :bounds="props.bounds" :focus-last="focusLast" persistent @update:open="close">
      <div class="overflow-toolbar-menu" @keydown="keyboard">
        <div v-for="item in items" :key="item.id" :ref="element => setHost(item.id, element)" class="overflow-toolbar-host" :hidden="!item.overflow.value || item.empty.value" />
      </div>
    </BasePopover>
  </div>
</template>

<style scoped>
.histoire-overflow-toolbar { --overflow-separator-width: 7px; position: relative; display: flex; align-items: center; gap: 3px; width: max-content; max-width: 100%; min-width: 0; }
.overflow-toolbar-items { display: flex; align-items: center; gap: inherit; min-width: 0; }
.overflow-toolbar-trigger { flex: none; }
.overflow-toolbar-trigger[hidden] { display: none; }
.overflow-toolbar-host[hidden] { display: none; }
</style>
