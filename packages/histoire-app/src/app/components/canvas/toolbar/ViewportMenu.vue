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
import { useCanvasViewportDimensions, useDeclaredStoryFrame, useStoryFrameSize } from './viewport-size.js'

defineProps<{ open: string | null }>()
const emit = defineEmits<{ 'update:open': [value: string | null], 'editPresets': [] }>()
const { snapshot, update } = useCanvasPreviewSettings()
const canvas = useCanvasStore()
const presetsOwner = usePresetConfigStore()
const presets = computed(() => presetsOwner?.responsivePresets.value ?? histoireConfig.responsivePresets ?? [])
const dimensions = useCanvasViewportDimensions()
const declared = useDeclaredStoryFrame()
const fromCode = useStoryFrameSize()
/** The story's own size replaces the toolbar viewport, so the trigger says where it comes from. */
const triggerLabel = computed(() => {
  if (fromCode.value) return 'From code'
  if (canvas.autoFitContent) return 'Auto fit'
  return String(dimensions.value.width)
})
const customWidth = ref('')
const customHeight = ref('')
const error = ref('')
watch(dimensions, (size) => {
  customWidth.value = String(size.width)
  customHeight.value = size.height === null ? '' : String(size.height)
}, { immediate: true })

/** Size the selected story from its code until the page reloads. */
function selectCode(): void {
  if (declared.value) canvas.setStorySizeFromCode(declared.value.storyId, true)
  emit('update:open', null)
}

/** Any other option sizes the selected story from the toolbar viewport instead of its code. */
function leaveCode(): void {
  if (declared.value) canvas.setStorySizeFromCode(declared.value.storyId, false)
}

/** Named preset sizes retain logical orientation and use existing settings persistence. */
function preset(width: number, height?: number | null) {
  error.value = ''
  leaveCode()
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
    leaveCode()
    canvas.setAutoFitContent(false)
    if (canvas.arrangement === 'single') canvas.setSingleViewportMode('fixed')
    update(patch)
  }
}

/** Responsive option fills available canvas width using bounded current root dimensions. */
function responsive() {
  error.value = ''
  leaveCode()
  canvas.setAutoFitContent(false)
  if (canvas.arrangement === 'single') canvas.setSingleViewportMode('responsive')
  else update({ responsiveWidth: Math.max(1, Math.round(canvas.viewport.width - canvas.inspectorWidth - 64)), responsiveHeight: null, rotate: false })
  emit('update:open', null)
}

/** Content mode retains stored manual viewport and independent camera zoom. */
function autoFit(): void {
  error.value = ''
  leaveCode()
  canvas.setAutoFitContent(true)
  emit('update:open', null)
}
</script>

<template>
  <ToolbarPopover id="viewport" :open="open" label="Viewport" :icon="fromCode ? 'code' : 'laptop'" :width="280" @update:open="emit('update:open', $event)">
    <template #trigger>
      <span class="htw:text-text htw:font-mono htw:text-[11px]">{{ triggerLabel }}</span><BuiltinIcon icon="chevron-down" :size="16" />
    </template>
    <PopoverTitle>
      Viewport
    </PopoverTitle>
    <PopoverRow v-if="declared" :aria-pressed="!!fromCode" @click="selectCode">
      <BuiltinIcon icon="code" :size="16" />From code<PopoverMeta>{{ declared.width ?? 'Auto' }} × {{ declared.height ?? 'Auto' }}</PopoverMeta>
    </PopoverRow>
    <PopoverRow :aria-pressed="!fromCode && !canvas.autoFitContent && canvas.arrangement === 'single' && canvas.singleViewport.mode === 'responsive'" @click="responsive">
      <BuiltinIcon icon="arrows-horizontal" :size="16" />{{ canvas.arrangement === 'single' ? 'Fill viewport' : 'Responsive' }}<PopoverMeta>fill</PopoverMeta>
    </PopoverRow>
    <PopoverRow :aria-pressed="!fromCode && canvas.autoFitContent" @click="autoFit">
      <BuiltinIcon icon="ruler" :size="16" />Auto fit content
    </PopoverRow>
    <PopoverRow v-for="(option, index) in presets" :key="index" :aria-pressed="!fromCode && !canvas.autoFitContent && (canvas.arrangement !== 'single' || canvas.singleViewport.mode === 'fixed') && snapshot.settings.responsiveWidth === option.width && snapshot.settings.responsiveHeight === (option.height ?? null)" @click="preset(option.width, option.height)">
      <BuiltinIcon :icon="option.width < 500 ? 'mobile' : option.width < 900 ? 'tablet' : 'screen'" :size="16" /><span>{{ option.label }}</span><PopoverMeta>
        {{ option.width }}<template v-if="option.height">
          × {{ option.height }}
        </template>
      </PopoverMeta>
    </PopoverRow>
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
