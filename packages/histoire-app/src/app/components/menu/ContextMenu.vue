<script setup lang="ts">
import type { WorkbenchContextAction } from '../../composables/context-menu.js'
import type { FrameAction } from '../../util/frame-actions.js'
import { getControlElement, HstButton, HstTextarea } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useContextMenu } from '../../composables/context-menu.js'
import { useFrameActions } from '../../util/frame-actions.js'
import { useShortcutRegistry } from '../../util/shortcuts.js'
import { usePopoverOverlay } from '../base/popover/overlay.js'
import { useMenuKeyboard } from '../base/use-menu-keyboard.js'
import MenuItem from './MenuItem.vue'
import SubMenu from './SubMenu.vue'

const overlay = usePopoverOverlay()
const snapshot = useHistoireSnapshot()
const state = useContextMenu()
const registry = useFrameActions()
const shortcuts = useShortcutRegistry()
const menu = ref<HTMLElement | null>(null)
const recovery = ref<HTMLTextAreaElement | null>(null)
const position = ref({ left: 0, top: 0 })
type MenuEntry = { kind: 'frame', action: FrameAction, disabled?: string } | { kind: 'context', action: WorkbenchContextAction, disabled?: string }
const target = computed(() => state?.state.context ?? null)
const frameTarget = computed(() => state?.state.target ?? null)
const actions = computed<MenuEntry[]>(() => {
  void snapshot.value
  const current = target.value
  if (!current) return []
  const currentFrame = frameTarget.value
  const frame = currentFrame ? registry?.list(currentFrame).map(action => ({ kind: 'frame' as const, action, disabled: action.disabled?.(currentFrame) })) ?? [] : []
  const contextual = state?.list(current).map(action => ({ kind: 'context' as const, action, disabled: action.disabled?.(current) })) ?? []
  return [...frame, ...contextual]
})
const label = computed(() => {
  const frame = frameTarget.value
  if (!frame) return target.value?.label ?? ''
  const story = snapshot.value.catalog.stories.find(item => item.id === frame.storyId)
  const variant = story?.variants.find(item => item.id === frame.variantId)
  return `${story?.title ?? frame.storyId} › ${variant?.title ?? frame.variantId}`
})

/** Run captured frame target even when selection changes before asynchronous action finishes. */
function run(entry: MenuEntry) {
  const captured = target.value
  const frame = frameTarget.value
  state?.close()
  if (entry.kind === 'frame' && frame) void registry?.run(entry.action, frame)
  else if (entry.kind === 'context' && captured) void state?.run(entry.action, captured)
}

const { navigate } = useMenuKeyboard({ close: () => state?.close(), tab: 'native' })
/** Context controller owns Escape and focus return; movement stays shared. */
function keyboard(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    state?.close(true)
  }
  else {
    navigate(event)
  }
}

/** Pointer dismissal leaves native preview content contextmenu untouched. */
function outside(event: PointerEvent) {
  if (target.value && !menu.value?.contains(event.target as Node)) state?.close()
}

/** Children use same source-mode/capability visibility rules as root actions. */
function children(action: FrameAction): readonly FrameAction[] {
  if (!frameTarget.value) return []
  const current = frameTarget.value
  return (action.children?.(current) ?? []).filter(item => (!item.devOnly || snapshot.value.source?.mode === 'dev') && item.available?.(current) !== false)
}

watch(target, async (value) => {
  if (!value || !state) return
  position.value = { left: Math.max(8, Math.min(state.state.x, window.innerWidth - 272)), top: state.state.y }
  await nextTick()
  if (target.value !== value) return
  position.value.top = Math.max(8, Math.min(state.state.y, window.innerHeight - (menu.value?.offsetHeight ?? 0) - 8))
  menu.value?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
})
watch(() => JSON.stringify(snapshot.value.source), () => state?.close())
watch(() => registry?.manualCopy.value, async (value) => {
  if (value !== null) {
    await nextTick()
    recovery.value?.focus()
    recovery.value?.select()
  }
})
onMounted(() => document.addEventListener('pointerdown', outside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside, true))
</script>

<template>
  <Teleport :to="overlay">
    <div v-if="target && actions.length" ref="menu" class="histoire-context-menu histoire-control-popover htw:fixed htw:z-60 htw:w-[264px] htw:max-w-[calc(100vw-16px)] htw:max-h-[calc(100vh-16px)] htw:p-[5px]" role="menu" :aria-label="label" :style="{ left: `${position.left}px`, top: `${position.top}px` }" @keydown="keyboard">
      <p class="htw:mt-[7px] htw:mx-[9px] htw:mb-[9px] htw:truncate htw:text-muted htw:text-[11px] htw:font-bold">
        {{ label }}
      </p>
      <template v-for="(entry, index) in actions" :key="`${entry.kind}:${entry.action.id}`">
        <div v-if="index && actions[index - 1].action.group !== entry.action.group" class="htw:h-px htw:my-[5px] htw:mx-1.5 htw:bg-border" role="separator" />
        <SubMenu v-if="entry.kind === 'frame' && entry.action.children && frameTarget" :action="entry.action" :items="children(entry.action)" :target="frameTarget" @action="run({ kind: 'frame', action: $event })" />
        <MenuItem v-else :label="entry.action.label" :icon="entry.action.icon" :disabled="entry.disabled" :shortcut="entry.action.shortcut ? shortcuts?.hint(entry.action.shortcut) : undefined" :ai="entry.action.group === 'ai'" @click="run(entry)" />
      </template>
    </div>
    <div v-if="registry?.manualCopy.value !== null && registry?.manualCopy.value !== undefined" class="histoire-control-popover htw:fixed htw:z-70 htw:left-1/2 htw:bottom-4 htw:-translate-x-1/2 htw:w-[min(400px,calc(100vw-32px))] htw:p-3" role="alert">
      <div class="htw:flex htw:justify-between htw:items-center htw:mb-2">
        <strong>Clipboard unavailable</strong><HstButton class="htw:py-1 htw:px-[7px] htw:text-body" color="flat" type="button" aria-label="Close copy recovery" @click="registry.dismissCopy()">
          Close
        </HstButton>
      </div>
      <HstTextarea :ref="value => { recovery = getControlElement(value) as HTMLTextAreaElement }" class="htw:w-full" input-class="htw:h-[100px]" layout="inline" :model-value="registry.manualCopy.value" readonly aria-label="Select text to copy manually" />
    </div>
  </Teleport>
</template>
