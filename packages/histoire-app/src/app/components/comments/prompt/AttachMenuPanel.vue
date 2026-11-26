<script setup lang="ts">
import type { UiScreenshotFile } from '@histoire/shared'
import { useHistoireSnapshot } from '@histoire/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { onScopeDispose, shallowRef } from 'vue'
import { catalogTargetLabel } from '../../../util/catalog-target.js'
import { screenshotUrl } from '../../../util/screenshot-file.js'
import { onUiEvent, sendUiEvent } from '../../../util/ui-channel.js'
import BasePopover from '../../base/popover/BasePopover.vue'
import PopoverDivider from '../../base/popover/PopoverDivider.vue'
import PopoverTitle from '../../base/popover/PopoverTitle.vue'
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
      <PopoverDivider role="separator" />
      <PopoverTitle>
        Recent screenshots
      </PopoverTitle>
      <div class="htw:grid htw:[grid-template-columns:repeat(3,_1fr)] htw:gap-px htw:pt-0 htw:px-2 htw:pb-2">
        <button v-for="file in recent" :key="file.path" type="button" role="menuitem" tabindex="-1" :aria-label="`Attach screenshot of ${catalogTargetLabel(file, snapshot.catalog)}`" :title="catalogTargetLabel(file, snapshot.catalog)" class="htw:[aspect-ratio:4_/_3] htw:p-0 htw:overflow-hidden htw:border htw:border-border htw:rounded-control htw:bg-chip htw:cursor-pointer htw:hover:border-agent htw:hover:outline-none htw:focus-visible:border-agent htw:focus-visible:outline-none" @click="emit('screenshot', file.path)">
          <img :src="screenshotUrl(file.path)" alt="" class="htw:block htw:w-full htw:h-full htw:object-cover">
        </button>
      </div>
    </template>
  </BasePopover>
</template>
