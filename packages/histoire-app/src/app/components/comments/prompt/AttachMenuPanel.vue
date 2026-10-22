<script setup lang="ts">
import type { UiScreenshotFile } from '@histoire/shared'
import { useHistoireSnapshot } from '@histoire/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { onScopeDispose, shallowRef } from 'vue'
import { catalogTargetLabel } from '../../../util/catalog-target.js'
import { screenshotUrl } from '../../../util/screenshot-file.js'
import { onUiEvent, sendUiEvent } from '../../../util/ui-channel.js'
import BasePopover from '../../base/popover/BasePopover.vue'
import MenuItem from '../../menu/MenuItem.vue'

/** One action row. */
export interface AttachMenuAction {
  /** Value emitted on pick. */
  id: 'files' | 'screenshot' | 'mention' | 'command'
  /** Visible text. */
  label: string
  /** Offline glyph name. */
  icon: string
  /** Shortcut or trigger character hint. */
  shortcut?: string
}

defineProps<{
  /** Trigger owning menu focus and position. */
  anchor: HTMLElement | null
  /** Action rows. */
  actions: readonly AttachMenuAction[]
}>()
const emit = defineEmits<{
  /** Action row picked. */
  action: [id: AttachMenuAction['id']]
  /** Recent screenshot picked. */
  screenshot: [path: string]
  /** Menu dismissed without a pick. */
  close: []
}>()
// Mounted only while open so the closed trigger needs no workbench context.
const context = useHistoireContext()
const snapshot = useHistoireSnapshot()
/** Most recent stored screenshots, newest first. */
const recent = shallowRef<UiScreenshotFile[]>([])
const requestId = crypto.randomUUID()
onScopeDispose(onUiEvent('histoire:ui:screenshot-list-result', (result) => {
  if (result.requestId === requestId) recent.value = result.files.slice(0, 6)
}))
sendUiEvent('histoire:ui:screenshot-list', { requestId })
</script>

<template>
  <BasePopover open :anchor="anchor" label="Add to message" role="menu" :width="264" align="start" side="top" :overlay-target="context.overlay.value ?? context.root.value" @update:open="emit('close')">
    <MenuItem v-for="action in actions" :key="action.id" :label="action.label" :icon="action.icon" :shortcut="action.shortcut" @click="emit('action', action.id)" />
    <template v-if="recent.length">
      <div class="popover-divider" role="separator" />
      <p class="popover-title">
        Recent screenshots
      </p>
      <div class="attach-recent">
        <button v-for="file in recent" :key="file.path" type="button" role="menuitem" tabindex="-1" :aria-label="`Attach screenshot of ${catalogTargetLabel(file, snapshot.catalog)}`" :title="catalogTargetLabel(file, snapshot.catalog)" @click="emit('screenshot', file.path)">
          <img :src="screenshotUrl(file.path)" alt="">
        </button>
      </div>
    </template>
  </BasePopover>
</template>

<style scoped>
.attach-recent { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 0 8px 8px; }
.attach-recent button { aspect-ratio: 4 / 3; padding: 0; overflow: hidden; border: 1px solid var(--histoire-border); border-radius: var(--histoire-radius-control); background: var(--histoire-chip); cursor: pointer; }
.attach-recent button:hover, .attach-recent button:focus-visible { border-color: var(--histoire-agent); outline: none; }
.attach-recent img { display: block; width: 100%; height: 100%; object-fit: cover; }
</style>
