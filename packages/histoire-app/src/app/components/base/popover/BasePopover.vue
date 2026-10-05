<script setup lang="ts">
import type { PopoverBoundary } from './position.js'
import type { PopoverScope } from './scope.js'
import { inject, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { positionPopover } from './position.js'
import { closePopoverChildren, createPopoverScope, deepestOpenPopover, popoverScopeKey } from './scope.js'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  /** Controlled panel visibility. */
  open: boolean
  /** Native trigger whose focus and geometry this panel owns. */
  anchor: HTMLElement | null
  /** Accessible panel name. */
  label: string
  /** Menu or general interactive panel semantics. */
  role?: 'menu' | 'dialog'
  /** Preferred panel width before surface clamping. */
  width?: number
  /** Owning surface teleport target. */
  overlayTarget?: HTMLElement | string | null
  /** Optional surface bounds, already excluding reserved chrome. */
  bounds?: PopoverBoundary
  /** Keep target available for single-instance Teleports while closed. */
  persistent?: boolean
  /** A toolbar may create its scope before this panel mounts. */
  scope?: PopoverScope
  /** Menu opening can start at last enabled row. */
  focusLast?: boolean
}>(), { role: 'dialog', width: 280 })
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const injected = inject(popoverScopeKey, undefined)
const parent = props.scope ? props.scope.parent : injected
const scope = props.scope ?? createPopoverScope(parent)
provide(popoverScopeKey, scope)
const panel = ref<HTMLElement | null>(null)
const position = ref({ left: 0, top: 0, width: props.width, maxHeight: 400 })
let observer: ResizeObserver | undefined
let active = true
let shown = props.open
let version = 0
let documentOwner: Document | undefined
scope.opened = () => active && shown
scope.anchor = () => props.anchor
scope.contains = target => Boolean(props.anchor?.contains(target) || panel.value?.contains(target) || [...scope.children].some(child => child.opened() && child.contains(target)))
scope.close = close

/** Explicit dismissal alone restores trigger; pointer dismissal leaves native focus. */
function close(restore = false): void {
  if (!shown) return
  shown = false
  version++
  closePopoverChildren(scope)
  emit('update:open', false)
  if (restore && props.anchor?.isConnected) props.anchor.focus({ preventScroll: true })
}

/** Reposition after resizing, scrolling, or moving a trigger between hosts. */
function place(): void {
  if (!active || !shown || !props.anchor) return
  const view = props.anchor.ownerDocument.defaultView
  if (!view) return
  const bounds = typeof props.bounds === 'function' ? props.bounds() : props.bounds
  position.value = positionPopover(props.anchor.getBoundingClientRect(), bounds ?? { left: 0, top: 0, right: view.innerWidth, bottom: view.innerHeight }, { width: view.innerWidth, height: view.innerHeight }, props.width)
}

/** Descendant portal clicks remain inside this logical overlay chain. */
function outside(event: PointerEvent): void {
  if (shown && !scope.contains(event.target as Node)) close()
}

/** Only deepest focused panel handles Escape, without touching another toolbar. */
function keyboard(event: KeyboardEvent): void {
  if (!shown || event.defaultPrevented || event.key !== 'Escape' || !scope.contains(event.target as Node)) return
  event.preventDefault()
  event.stopPropagation()
  deepestOpenPopover(scope).close(true)
}

watch(() => props.open, async (value) => {
  shown = value
  const current = ++version
  if (!value) {
    closePopoverChildren(scope)
    return
  }
  await nextTick()
  if (!active || !shown || current !== version) return
  place()
  const controls = [...panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []]
  ;(controls[props.focusLast ? controls.length - 1 : 0] ?? panel.value)?.focus({ preventScroll: true })
}, { immediate: true })
watch([() => typeof props.bounds === 'function' ? props.bounds() : props.bounds, () => props.anchor], place, { deep: true, flush: 'post' })
watch(() => props.anchor, (anchor, previous) => {
  if (previous) observer?.unobserve(previous)
  if (anchor) observer?.observe(anchor)
})
onMounted(() => {
  parent?.children.add(scope)
  documentOwner = props.anchor?.ownerDocument ?? panel.value?.ownerDocument ?? document
  documentOwner.addEventListener('pointerdown', outside, true)
  documentOwner.addEventListener('keydown', keyboard, true)
  documentOwner.addEventListener('scroll', place, true)
  documentOwner.defaultView?.addEventListener('resize', place)
  observer = new ResizeObserver(place)
  if (props.anchor) observer.observe(props.anchor)
})
onBeforeUnmount(() => {
  active = false
  shown = false
  version++
  closePopoverChildren(scope)
  parent?.children.delete(scope)
  documentOwner?.removeEventListener('pointerdown', outside, true)
  documentOwner?.removeEventListener('keydown', keyboard, true)
  documentOwner?.removeEventListener('scroll', place, true)
  documentOwner?.defaultView?.removeEventListener('resize', place)
  observer?.disconnect()
})
defineExpose({ panel, close, place })
</script>

<template>
  <Teleport :to="overlayTarget ?? 'body'">
    <div v-if="persistent || open" v-show="open" ref="panel" v-bind="$attrs" class="histoire-base-popover histoire-control-popover" :role="role" :aria-label="label" tabindex="-1" :style="{ left: `${position.left}px`, top: `${position.top}px`, width: `${position.width}px`, maxHeight: `${position.maxHeight}px`, zIndex: 50 + scope.depth }" @wheel.stop @pointerdown.stop>
      <slot :close="close" />
    </div>
  </Teleport>
</template>

<style scoped>
.histoire-base-popover { position: fixed; box-sizing: border-box; max-width: calc(100vw - 16px);  }
.histoire-base-popover :deep(.popover-title) { margin: 8px 8px 10px; color: var(--histoire-muted); font-size: 11px; font-weight: 700; }
.histoire-base-popover :deep(.popover-row) { display: flex; width: 100%; min-height: 32px; gap: 9px; align-items: center; padding: 6px 8px; text-align: start; }
.histoire-base-popover :deep(.popover-meta) { margin-inline-start: auto; color: var(--histoire-muted); font-family: var(--histoire-font-mono); font-size: 11px; }
.histoire-base-popover :deep(.popover-divider) { height: 1px; margin: 5px 0; background: var(--histoire-border); }
.histoire-base-popover :deep(.popover-error) { margin: 5px 8px; color: var(--histoire-danger); font-size: 11px; }
</style>
