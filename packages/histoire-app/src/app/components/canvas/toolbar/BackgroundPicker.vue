<script setup lang="ts">
import { HstButton, HstButtonGroup, HstText } from '@histoire/controls/vue'
import { PREVIEW_SETTINGS_SYNC } from '@histoire/shared'
import { computed, ref, useId } from 'vue'
import { useCanvasFrames, useCanvasStore } from '../../../composables/canvas-settings.js'
import { usePresetConfigStore } from '../../../stores/presets-config.js'
import { getBackgroundPreset, getBackgroundPresetStyle, withCheckerboardPresets } from '../../../util/background.js'
import { histoireConfig } from '../../../util/config.js'
import { useCanvasPreviewSettings } from './session-settings.js'
import { backgroundPatch } from './settings.js'
import ToolbarPopover from './ToolbarPopover.vue'

defineProps<{ open: string | null }>()
const emit = defineEmits<{ 'update:open': [value: string | null] }>()
const canvas = useCanvasStore()
const frames = useCanvasFrames()
const { snapshot, update } = useCanvasPreviewSettings()
const presetsOwner = usePresetConfigStore()
const presets = computed(() => withCheckerboardPresets(presetsOwner?.backgroundPresets.value ?? histoireConfig.backgroundPresets ?? []))
const scope = ref<'all' | 'selected'>('all')
const customHex = ref('#FEF3C7')
const customId = useId()
const error = ref('')
const selected = computed(() => canvas.selectedFrame ? canvas.frameBackgrounds[canvas.selectedFrame] : undefined)
const background = computed(() => scope.value === 'selected' && selected.value ? selected.value : snapshot.value.settings)
const activePreset = computed(() => getBackgroundPreset(background.value))

/** Shared backgrounds use canonical session; frame-only override remains canvas-owned. */
function apply(color: string, custom = false) {
  const patch = backgroundPatch(color, false, custom)
  error.value = patch ? '' : 'Enter a hex color, such as #FEF3C7.'
  if (!patch) return
  if (scope.value === 'selected' && canvas.selectedFrame) {
    canvas.setFrameBackground(canvas.selectedFrame, patch.backgroundColor!, patch.checkerboard, patch.checkerboardTheme)
    frames.postToFrame(canvas.selectedFrame, { type: PREVIEW_SETTINGS_SYNC, settings: { ...snapshot.value.settings, ...patch } })
  }
  else {
    canvas.setBackground(patch.backgroundColor!)
    for (const id of Object.keys(canvas.frameBackgrounds)) delete canvas.frameBackgrounds[id]
    update(patch)
  }
}
</script>

<template>
  <ToolbarPopover id="background" :open="open" label="Background" icon="color-palette" :width="280" data-test-id="toolbar-background" @update:open="emit('update:open', $event)">
    <template #trigger>
      <span class="toolbar-menu-only background-trigger-swatch" :style="getBackgroundPresetStyle({ color: activePreset, label: '' })" />
    </template>
    <div data-test-id="background-popper">
      <p class="popover-title">
        Background
      </p>
      <div class="background-swatches">
        <HstButton v-for="(option, index) in presets" :key="index" color="flat" type="button" class="background-swatch" :style="getBackgroundPresetStyle(option)" :aria-label="option.label" :title="option.label" :aria-pressed="activePreset === option.color" @click="apply(option.color)">
          Aa
        </HstButton>
      </div>
      <form class="background-custom" @submit.prevent="apply(customHex, true)">
        <span class="custom-swatch" :style="{ backgroundColor: /^#[\da-f]{3,8}$/i.test(customHex) ? customHex : undefined }" /><label :for="customId">Custom</label><HstText :id="customId" v-model="customHex" layout="inline" aria-label="Custom hex color" maxlength="9" @change="apply(customHex, true)" /><HstButton color="flat" class="visually-hidden" type="submit">
          Apply custom background
        </HstButton>
      </form>
      <p v-if="error" class="popover-error" role="alert">
        {{ error }}
      </p>
      <div class="popover-divider" />
      <HstButtonGroup v-model="scope" title="Apply to" layout="horizontal" aria-label="Apply background to" :options="[{ value: 'all', label: 'All frames' }, { value: 'selected', label: 'Selected', disabled: !canvas.selectedFrame }]" />
    </div>
  </ToolbarPopover>
</template>

<style scoped>
.background-swatches { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; padding: 0 8px 7px; }
.background-trigger-swatch { display: none; width: 14px; height: 14px; border: 1px solid var(--histoire-border); border-radius: 3px; }
.background-swatch { min-width: 0; height: 42px; padding: 0; border: 1px solid var(--histoire-border); border-radius: 9px; cursor: pointer; font: inherit; color: var(--histoire-text); }
.background-swatch[aria-pressed="true"] { outline: 2px solid var(--histoire-accent); outline-offset: 2px; }
.background-custom { display: flex; align-items: center; gap: 8px; padding: 7px 8px; }
.custom-swatch { width: 20px; height: 20px; border-radius: 5px; border: 1px solid var(--histoire-border); }
.background-custom .histoire-text { width: 100px; margin-left: auto; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
