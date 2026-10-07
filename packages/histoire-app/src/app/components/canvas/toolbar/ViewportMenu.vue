<script setup lang="ts">
import { BuiltinIcon, HstButton, HstText } from '@histoire/controls/vue'
import { computed, ref, watch } from 'vue'
import { useCanvasStore } from '../../../composables/canvas-settings.js'
import { usePresetConfigStore } from '../../../stores/presets-config.js'
import { histoireConfig } from '../../../util/config.js'

import { useCanvasPreviewSettings } from './session-settings.js'
import { parseViewportSize, viewportDimensions } from './settings.js'
import ToolbarPopover from './ToolbarPopover.vue'

defineProps<{ open: string | null }>()
const emit = defineEmits<{ 'update:open': [value: string | null], 'editPresets': [] }>()
const { snapshot, update } = useCanvasPreviewSettings()
const canvas = useCanvasStore()
const presetsOwner = usePresetConfigStore()
const presets = computed(() => presetsOwner?.responsivePresets.value ?? histoireConfig.responsivePresets ?? [])
const displayedSettings = computed(() => canvas.arrangement === 'single' ? { ...snapshot.value.settings, responsiveWidth: canvas.singleViewportSize.width, responsiveHeight: canvas.singleViewportSize.height, rotate: false } : snapshot.value.settings)
const dimensions = computed(() => viewportDimensions(displayedSettings.value))
const customWidth = ref('')
const customHeight = ref('')
const error = ref('')
watch(displayedSettings, (settings) => {
  customWidth.value = String(settings.responsiveWidth)
  customHeight.value = settings.responsiveHeight === null ? '' : String(settings.responsiveHeight)
}, { immediate: true })

/** Named preset sizes retain logical orientation and use existing settings persistence. */
function preset(width: number, height?: number | null) {
  if (canvas.arrangement === 'single') canvas.setSingleViewportMode('fixed')
  update({ responsiveWidth: width, responsiveHeight: height ?? null, rotate: false })
  emit('update:open', null)
}

/** Invalid dimensions stay local and never reach selected runtime. */
function custom() {
  const patch = parseViewportSize(customWidth.value, customHeight.value)
  error.value = patch ? '' : 'Use whole pixels from 1 to 16384.'
  if (patch) {
    if (canvas.arrangement === 'single') canvas.setSingleViewportMode('fixed')
    update(patch)
  }
}

/** Responsive option fills available canvas width using bounded current root dimensions. */
function responsive() {
  if (canvas.arrangement === 'single') canvas.setSingleViewportMode('responsive')
  else update({ responsiveWidth: Math.max(1, Math.round(canvas.viewport.width - canvas.inspectorWidth - 64)), responsiveHeight: null, rotate: false })
  emit('update:open', null)
}
</script>

<template>
  <ToolbarPopover id="viewport" :open="open" label="Viewport" icon="laptop" :width="280" @update:open="emit('update:open', $event)">
    <template #trigger>
      <span class="viewport-size">{{ dimensions.width }}</span><BuiltinIcon icon="chevron-down" :size="12" />
    </template>
    <p class="popover-title">
      Viewport
    </p>
    <HstButton color="flat" class="popover-row" :aria-pressed="canvas.arrangement === 'single' && canvas.singleViewport.mode === 'responsive'" @click="responsive">
      <BuiltinIcon icon="arrows-horizontal" :size="16" />Responsive<span class="popover-meta">fill</span>
    </HstButton>
    <HstButton v-for="(option, index) in presets" :key="index" color="flat" class="popover-row" :aria-pressed="(canvas.arrangement !== 'single' || canvas.singleViewport.mode === 'fixed') && snapshot.settings.responsiveWidth === option.width && snapshot.settings.responsiveHeight === (option.height ?? null)" @click="preset(option.width, option.height)">
      <BuiltinIcon :icon="option.width < 500 ? 'mobile' : option.width < 900 ? 'tablet' : 'screen'" :size="16" /><span>{{ option.label }}</span><span class="popover-meta">{{ option.width }}<template v-if="option.height"> × {{ option.height }}</template></span>
    </HstButton>
    <div class="popover-divider" />
    <form class="viewport-custom" @submit.prevent="custom">
      <span>Custom</span><HstText v-model="customWidth" layout="inline" aria-label="Custom width" inputmode="numeric" @change="custom" /><span>×</span><HstText v-model="customHeight" layout="inline" aria-label="Custom height" placeholder="Auto" inputmode="numeric" @change="custom" />
      <HstButton color="flat" type="submit" class="visually-hidden">
        Apply custom viewport
      </HstButton>
    </form>
    <p v-if="error" class="popover-error" role="alert">
      {{ error }}
    </p>
    <HstButton color="flat" class="popover-row viewport-edit" @click="emit('update:open', null); emit('editPresets')">
      <BuiltinIcon icon="settings" :size="16" />Edit presets…
    </HstButton>
  </ToolbarPopover>
</template>

<style scoped>
.viewport-size { color: var(--histoire-text); font-family: var(--histoire-font-mono); font-size: 11px; }
.viewport-custom { display: flex; align-items: center; gap: 6px; padding: 6px 8px; color: var(--histoire-muted); font-size: 11px; }
.viewport-custom > span:first-child { margin-right: auto; }
.viewport-custom .histoire-text { flex: 1; min-width: 0; }
.viewport-edit { color: var(--histoire-accent) !important; font-weight: 700 !important; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
