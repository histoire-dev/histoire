<script setup lang="ts">
import type { AttachMenuAction } from './AttachMenuPanel.vue'
import { BuiltinIcon, HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import { computed } from 'vue'
import AttachMenuPanel from './AttachMenuPanel.vue'
import { useMenuTrigger } from './menu-trigger.js'

const props = defineProps<{
  /** Disables the trigger. */
  disabled?: boolean
  /** Offer screenshot capture. */
  capture?: boolean
  /** A capture is in flight. */
  capturing?: boolean
  /** Offer agent commands. */
  commands?: boolean
  /** Shortcut hints of the attach and capture actions. */
  hints: { files: string, screenshot: string }
}>()
const emit = defineEmits<{
  /** Action row picked. */
  action: [id: AttachMenuAction['id']]
  /** Recent screenshot picked. */
  screenshot: [path: string]
}>()
const { open, trigger, anchor, toggle, close } = useMenuTrigger()
const actions = computed<AttachMenuAction[]>(() => [
  { id: 'files', label: 'Attach files…', icon: 'attachment', shortcut: props.hints.files },
  ...props.capture ? [{ id: 'screenshot' as const, label: 'Capture screenshot', icon: 'camera', shortcut: props.hints.screenshot }] : [],
  { id: 'mention', label: 'Mention a file', icon: 'document', shortcut: '@' },
  ...props.commands ? [{ id: 'command' as const, label: 'Use a command', icon: 'terminal', shortcut: '/' }] : [],
])

/** Run the picked action and dismiss the menu. */
function pick(id: AttachMenuAction['id']): void {
  close()
  emit('action', id)
}
/** Attach the picked screenshot and dismiss the menu. */
function pickScreenshot(path: string): void {
  close()
  emit('screenshot', path)
}
</script>

<template>
  <HstButton ref="trigger" icon-only color="flat" type="button" class="attach-menu" :aria-label="capturing ? 'Capturing screenshot' : 'Add to message'" aria-haspopup="menu" :aria-expanded="open" :title="capturing ? 'Capturing screenshot' : 'Add to message'" :disabled="disabled" @click="toggle">
    <HstPulsatingDisc v-if="capturing" :size="12" />
    <BuiltinIcon v-else icon="add" :size="16" />
  </HstButton>
  <AttachMenuPanel v-if="open" :anchor="anchor" :actions="actions" @action="pick" @screenshot="pickScreenshot" @close="close" />
</template>

<style scoped>
.attach-menu { color: var(--histoire-muted); }
</style>
