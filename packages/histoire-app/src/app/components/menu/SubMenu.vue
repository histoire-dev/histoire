<script setup lang="ts">
import type { FrameAction, FrameActionTarget } from '../../util/frame-actions.js'
import { nextTick, ref } from 'vue'
import { useShortcutRegistry } from '../../util/shortcuts.js'
import { useMenuKeyboard } from '../base/use-menu-keyboard.js'
import MenuItem from './MenuItem.vue'

/** Submenu shares target capture and restores its parent row on keyboard dismissal. */
const props = defineProps<{ action: FrameAction, items: readonly FrameAction[], target: FrameActionTarget }>()
const emit = defineEmits<{ action: [value: FrameAction] }>()
const shortcuts = useShortcutRegistry()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const position = ref({ left: 0, top: 0 })

/** Viewport-edge flipping also covers menus launched near bottom-right canvas corner. */
async function show() {
  open.value = true
  await nextTick()
  const rect = root.value?.getBoundingClientRect()
  if (rect) position.value = { left: rect.right + 246 > window.innerWidth ? Math.max(8, rect.left - 246) : rect.right + 6, top: Math.min(rect.top, window.innerHeight - (menu.value?.offsetHeight ?? 0) - 8) }
  menu.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
}

const { navigate } = useMenuKeyboard({ open, tab: 'bubble' })
/** Submenu owns Left/Escape dismissal; row movement stays shared. */
function keyboard(event: KeyboardEvent) {
  if (['ArrowLeft', 'Escape'].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
    open.value = false
    root.value?.querySelector<HTMLButtonElement>('button')?.focus()
  }
  else {
    navigate(event)
  }
}
</script>

<template>
  <div ref="root">
    <MenuItem :label="action.label" :icon="action.icon" submenu :ai="action.group === 'ai'" :aria-expanded="open" @click="show" @keydown.right.prevent.stop="show" />
    <div v-if="open" ref="menu" class="histoire-submenu-panel histoire-control-popover htw:fixed htw:z-[61] htw:w-60 htw:max-w-[calc(100vw-16px)] htw:p-[5px]" role="menu" :aria-label="action.label" :style="{ left: `${position.left}px`, top: `${position.top}px` }" @keydown="keyboard">
      <MenuItem v-for="item in items" :key="item.id" :label="item.label" :icon="item.icon" :disabled="item.disabled?.(target)" :shortcut="item.shortcut ? shortcuts?.hint(item.shortcut) : undefined" :ai="item.group === 'ai'" @click="emit('action', item)" />
    </div>
  </div>
</template>
