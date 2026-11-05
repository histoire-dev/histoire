<script setup lang="ts">
import type { CanvasMode } from './overlay-geometry.js'
import type { OverlayState } from './overlay-state.js'
import { BuiltinIcon, HstButton, HstButtonGroup, HstSlider } from '@histoire/controls/vue'
import { computed, onScopeDispose, ref } from 'vue'

const props = defineProps<{
  /** Comparison mode and opacity shared with the canvas view. */
  overlay: OverlayState
}>()
const emit = defineEmits<{
  /** Restores the default placement of the shown design. */
  reset: []
}>()

/** Toggle options in display order. */
const options: { label: string, value: CanvasMode }[] = [
  { label: 'Side by side', value: 'side-by-side' },
  { label: 'Overlay', value: 'overlay' },
  { label: 'Split', value: 'split' },
]

// The state is not reactive: a revision counter makes computed values re-read it.
/** Bumped on every overlay state change. */
const revision = ref(0)
onScopeDispose(props.overlay.subscribe(() => revision.value++))

/** Current comparison mode. */
const mode = computed(() => {
  void revision.value
  return props.overlay.mode()
})
/** Overlay opacity in percent, as the slider shows it. */
const opacity = computed(() => {
  void revision.value
  return Math.round(props.overlay.opacity() * 100)
})
</script>

<template>
  <div class="histoire-designs histoire-designs-mode" role="toolbar" aria-label="Design comparison">
    <HstButtonGroup
      class="histoire-designs-mode-switch"
      aria-label="Comparison mode"
      :classes="{ option: 'histoire-designs-mode-option' }"
      :options="options"
      :model-value="mode"
      @update:model-value="overlay.setMode($event)"
    />
    <HstSlider
      v-if="mode === 'overlay'"
      class="histoire-designs-mode-opacity"
      aria-label="Design opacity"
      :min="10"
      :max="100"
      :model-value="opacity"
      @update:model-value="overlay.setOpacity($event / 100)"
    />
    <HstButton
      v-if="mode !== 'side-by-side'"
      color="flat"
      icon-only
      aria-label="Reset design placement"
      title="Reset design placement"
      @click="emit('reset')"
    >
      <BuiltinIcon icon="reset" :size="16" />
    </HstButton>
  </div>
</template>
