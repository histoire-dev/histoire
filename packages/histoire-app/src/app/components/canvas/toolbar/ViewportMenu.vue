<script setup lang="ts">
import { BuiltinIcon, HstButton, HstText } from '@histoire/controls/vue'
import { computed, ref, watch } from 'vue'
import { useCanvasStore } from '../../../composables/canvas-settings.js'
import { usePresetConfigStore } from '../../../stores/presets-config.js'
import { histoireConfig } from '../../../util/config.js'

import PopoverDivider from '../../base/popover/PopoverDivider.vue'
import PopoverError from '../../base/popover/PopoverError.vue'
import PopoverMeta from '../../base/popover/PopoverMeta.vue'
import PopoverRow from '../../base/popover/PopoverRow.vue'
import PopoverTitle from '../../base/popover/PopoverTitle.vue'
import { useCanvasPreviewSettings } from './session-settings.js'
import { parseViewportSize } from './settings.js'
import ToolbarPopover from './ToolbarPopover.vue'
import { useCanvasViewportDimensions } from './viewport-size.js'

defineProps<{ open: string | null }>()
const emit = defineEmits<{ 'update:open': [value: string | null], 'editPresets': [] }>()
const { snapshot, update } = useCanvasPreviewSettings()
const canvas = useCanvasStore()
const presetsOwner = usePresetConfigStore()
const presets = computed(() => presetsOwner?.responsivePresets.value ?? histoireConfig.responsivePresets ?? [])
const dimensions = useCanvasViewportDimensions()
const customWidth = ref('')
const customHeight = ref('')
const error = ref('')
watch(dimensions, (size) => {
  customWidth.value = String(size.width)
  customHeight.value = size.height === null ? '' : String(size.height)
}, { immediate: true })

/** Named preset sizes retain logical orientation and use existing settings persistence. */
function preset(width: number, height?: number | null) {
  error.value = ''
  canvas.setAutoFitContent(false)
  if (canvas.arrangement === 'single') canvas.setSingleViewportMode('fixed')
  update({ responsiveWidth: width, responsiveHeight: height ?? null, rotate: false })
  emit('update:open', null)
}

/** Invalid dimensions stay local and never reach selected runtime. */
function custom() {
  const patch = parseViewportSize(customWidth.value, customHeight.value)
  error.value = patch ? '' : 'Use whole pixels from 1 to 16384.'
  if (patch) {
    canvas.setAutoFitContent(false)
    if (canvas.arrangement === 'single') canvas.setSingleViewportMode('fixed')
    update(patch)
  }
}

/** Responsive option fills available canvas width using bounded current root dimensions. */
function responsive() {
  error.value = ''
  canvas.setAutoFitContent(false)
  if (canvas.arrangement === 'single') canvas.setSingleViewportMode('responsive')
  else update({ responsiveWidth: Math.max(1, Math.round(canvas.viewport.width - canvas.inspectorWidth - 64)), responsiveHeight: null, rotate: false })
  emit('update:open', null)
}

/** Content mode retains stored manual viewport and independent camera zoom. */
function autoFit(): void {
  error.value = ''
  canvas.setAutoFitContent(true)
  emit('update:open', null)
}
</script>

<template>
  <ToolbarPopover id="viewport" :open="open" label="Viewport" icon="laptop" :width="280" @update:open="emit('update:open', $event)">
    <template #trigger>
      <span class="htw:text-text htw:font-mono htw:text-[11px]">{{ canvas.autoFitContent ? 'Auto fit' : dimensions.width }}</span><BuiltinIcon icon="chevron-down" :size="16" />
    </template>
    <PopoverTitle>
      Viewport
    </PopoverTitle>
    <div class="htw:menu-rows">
      <PopoverRow :aria-pressed="!canvas.autoFitContent && canvas.arrangement === 'single' && canvas.singleViewport.mode === 'responsive'" @click="responsive">
        <BuiltinIcon icon="arrows-horizontal" :size="16" />{{ canvas.arrangement === 'single' ? 'Fill viewport' : 'Responsive' }}<PopoverMeta>fill</PopoverMeta>
      </PopoverRow>
      <PopoverRow :aria-pressed="canvas.autoFitContent" @click="autoFit">
        <BuiltinIcon icon="ruler" :size="16" />Auto fit content
      </PopoverRow>
      <PopoverRow v-for="(option, index) in presets" :key="index" :aria-pressed="!canvas.autoFitContent && (canvas.arrangement !== 'single' || canvas.singleViewport.mode === 'fixed') && snapshot.settings.responsiveWidth === option.width && snapshot.settings.responsiveHeight === (option.height ?? null)" @click="preset(option.width, option.height)">
        <BuiltinIcon :icon="option.width < 500 ? 'mobile' : option.width < 900 ? 'tablet' : 'screen'" :size="16" /><span>{{ option.label }}</span><PopoverMeta>
          {{ option.width }}<template v-if="option.height">
            × {{ option.height }}
          </template>
        </PopoverMeta>
      </PopoverRow>
    </div>
    <PopoverDivider />
    <form class="viewport-custom htw:flex htw:items-center htw:gap-1.5 htw:py-1.5 htw:px-2 htw:text-muted htw:text-[11px]" @submit.prevent="custom">
      <span class="htw:mr-auto">Custom</span><HstText v-model="customWidth" class="htw:flex-1 htw:min-w-0" layout="inline" aria-label="Custom width" inputmode="numeric" @change="custom" /><span>×</span><HstText v-model="customHeight" class="htw:flex-1 htw:min-w-0" layout="inline" aria-label="Custom height" placeholder="Auto" inputmode="numeric" @change="custom" />
      <HstButton color="flat" type="submit" class="htw:absolute htw:w-px htw:h-px htw:overflow-hidden htw:[clip-path:inset(50%)]">
        Apply custom viewport
      </HstButton>
    </form>
    <PopoverError v-if="error" role="alert">
      {{ error }}
    </PopoverError>
    <PopoverRow tone="accent" class="htw:font-bold" @click="emit('update:open', null); emit('editPresets')">
      <BuiltinIcon icon="settings" :size="16" />Edit presets…
    </PopoverRow>
  </ToolbarPopover>
</template>
