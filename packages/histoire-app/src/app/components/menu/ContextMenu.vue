<script setup lang="ts">
import type { FrameAction } from '../../util/frame-actions.js'
import { getControlElement, HstButton, HstTextarea } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useContextMenu } from '../../composables/context-menu.js'
import { useFrameActions } from '../../util/frame-actions.js'
import { useShortcutRegistry } from '../../util/shortcuts.js'
import MenuItem from './MenuItem.vue'
import SubMenu from './SubMenu.vue'

const context = useHistoireContext()
const snapshot = useHistoireSnapshot()
const state = useContextMenu()
const registry = useFrameActions()
const shortcuts = useShortcutRegistry()
const menu = ref<HTMLElement | null>(null)
const recovery = ref<HTMLTextAreaElement | null>(null)
const position = ref({ left: 0, top: 0 })
const target = computed(() => state?.state.target ?? null)
const actions = computed(() => {
  void snapshot.value
  return target.value ? registry?.list(target.value) ?? [] : []
})
const label = computed(() => {
  const story = snapshot.value.catalog.stories.find(item => item.id === target.value?.storyId)
  const variant = story?.variants.find(item => item.id === target.value?.variantId)
  return `${story?.title ?? target.value?.storyId} › ${variant?.title ?? target.value?.variantId}`
})

/** Run captured frame target even when selection changes before asynchronous action finishes. */
function run(action: FrameAction) {
  const captured = target.value
  state?.close()
  if (captured) void registry?.run(action, captured)
}

/** Root arrow navigation skips disabled items and hidden submenu descendants. */
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    state?.close(true)
    return
  }
  if (event.key === 'Tab') {
    state?.close()
    return
  }
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = [...menu.value!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')].filter(button => button.closest('[role="menu"]') === menu.value)
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next]?.focus()
}

/** Pointer dismissal leaves native preview content contextmenu untouched. */
function outside(event: PointerEvent) {
  if (target.value && !menu.value?.contains(event.target as Node)) state?.close()
}

/** Children use same source-mode/capability visibility rules as root actions. */
function children(action: FrameAction): readonly FrameAction[] {
  if (!target.value) return []
  const current = target.value
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
  <Teleport :to="context.overlay.value ?? context.root.value ?? 'body'">
    <div v-if="target && registry" ref="menu" class="histoire-context-menu histoire-control-popover" role="menu" :aria-label="label" :style="{ left: `${position.left}px`, top: `${position.top}px` }" @keydown="keyboard">
      <p class="context-target">
        {{ label }}
      </p>
      <template v-for="(action, index) in actions" :key="action.id">
        <div v-if="index && actions[index - 1].group !== action.group" class="menu-divider" role="separator" />
        <SubMenu v-if="action.children" :action="action" :items="children(action)" :target="target" @action="run" />
        <MenuItem v-else :label="action.label" :icon="action.icon" :disabled="action.disabled?.(target)" :shortcut="action.shortcut ? shortcuts?.hint(action.shortcut) : undefined" :ai="action.group === 'ai'" @click="run(action)" />
      </template>
    </div>
    <div v-if="registry?.manualCopy.value !== null && registry?.manualCopy.value !== undefined" class="histoire-copy-recovery histoire-control-popover" role="alert">
      <div>
        <strong>Clipboard unavailable</strong><HstButton color="flat" type="button" aria-label="Close copy recovery" @click="registry.dismissCopy()">
          Close
        </HstButton>
      </div>
      <HstTextarea :ref="value => { recovery = getControlElement(value) as HTMLTextAreaElement }" layout="inline" :model-value="registry.manualCopy.value" readonly aria-label="Select text to copy manually" />
    </div>
  </Teleport>
</template>

<style scoped>
.histoire-context-menu { position: fixed; z-index: 60; width: 264px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); padding: 5px; }
.context-target { margin: 7px 9px 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--histoire-muted); font-size: 11px; font-weight: 700; }
.menu-divider { height: 1px; margin: 5px 6px; background: var(--histoire-border); }
.histoire-copy-recovery { position: fixed; z-index: 70; left: 50%; bottom: 16px; transform: translateX(-50%); width: min(400px, calc(100vw - 32px)); padding: 12px; }
.histoire-copy-recovery > div { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.histoire-copy-recovery button { padding: 4px 7px; color: var(--histoire-body); }
.histoire-copy-recovery .histoire-textarea { width: 100%; }
.histoire-copy-recovery :deep(textarea) { height: 100px; }
</style>
