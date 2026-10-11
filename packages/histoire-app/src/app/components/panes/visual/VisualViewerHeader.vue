<script setup lang="ts">
import { BuiltinIcon, HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import { computed, ref, useId, watch } from 'vue'
import { useWorkbenchVisual } from '../../../stores/visual.js'
import { visualStatus } from './status.js'

defineProps<{
  /** Dialog's accessible title ID. */
  titleId: string
  /** Story or matrix case title. */
  title: string
  /** Selected result's position in filtered run. */
  index: number
  /** Failed captures show their message in the board instead. */
  captureFailed: boolean
}>()
const emit = defineEmits<{
  /** Page without changing canonical story selection. */
  move: [direction: number]
  /** Close review and restore its trigger. */
  close: []
}>()
const model = useWorkbenchVisual()!
const result = model.selectedResult
const warningsOpen = ref(false)
const warningId = useId()
const warnings = computed(() => [result.value?.error, result.value?.warning].filter(Boolean))
/** Same tone as results list rows; passed maps to accent dot color. */
const tone = computed(() => {
  const statusTone = result.value ? visualStatus(result.value).tone : 'muted'
  return statusTone === 'passed' ? 'accent' : statusTone
})
watch(result, () => {
  warningsOpen.value = false
})
</script>

<template>
  <header class="viewer-header">
    <div class="title-pill viewer-float">
      <span class="status-dot" :data-tone="tone" aria-hidden="true" />
      <div class="identity">
        <h2 :id="titleId">
          {{ title }}
        </h2>
        <small>{{ result?.spec.id }} · {{ result?.baselineSource }}<code v-if="result?.baselineCommit"> {{ result.baselineCommit.slice(0, 8) }}</code></small>
        <small v-if="result" class="status" role="status">
          <HstPulsatingDisc v-if="model.approvalPending(result)" :size="10" />
          <span>{{ model.approvalPending(result) ? 'Saving baseline' : visualStatus(result).label }}</span>
          <span v-if="result.staleReason"> · {{ result.staleReason }}</span>
          <span v-else-if="result.restored"> · Restored<span v-if="result.capturedAt"> · {{ new Date(result.capturedAt).toLocaleString() }}</span></span>
        </small>
      </div>
      <span v-if="result?.diffPixels !== undefined || result?.currentDimensions" class="divider" aria-hidden="true" />
      <code v-if="result?.diffPixels !== undefined" class="ratio" :data-tone="tone" :title="`${result.diffPixels} pixels`">{{ ((result.diffPixelRatio ?? 0) * 100).toFixed(3) }}%</code>
      <code v-if="result?.currentDimensions" class="dimensions">{{ result.currentDimensions.width }} × {{ result.currentDimensions.height }}</code>
    </div>
    <div v-if="!captureFailed && warnings.length" class="warnings">
      <HstButton class="warning-chip viewer-float" :aria-expanded="warningsOpen" :aria-controls="warningId" @click="warningsOpen = !warningsOpen">
        <BuiltinIcon icon="warning-alt" :size="14" />
        {{ warnings.length }} {{ warnings.length === 1 ? 'warning' : 'warnings' }}
      </HstButton>
      <div v-if="warningsOpen" :id="warningId" class="warning-panel viewer-float" role="region" aria-label="Capture warnings">
        <p v-for="(warning, warningIndex) in warnings" :key="warningIndex">
          {{ warning }}
        </p>
      </div>
    </div>
    <nav class="navigation" aria-label="Visual results">
      <div class="pager viewer-float">
        <HstButton color="flat" icon-only aria-label="Previous visual result" :disabled="index <= 0" @click="emit('move', -1)">
          <BuiltinIcon icon="chevron-left" :size="18" />
        </HstButton>
        <code><span>{{ index + 1 }}</span> / {{ model.results.value.length }}</code>
        <HstButton color="flat" icon-only aria-label="Next visual result" :disabled="index >= model.results.value.length - 1" @click="emit('move', 1)">
          <BuiltinIcon icon="chevron-right" :size="18" />
        </HstButton>
      </div>
      <HstButton class="close-button viewer-float" icon-only aria-label="Close visual review" @click="emit('close')">
        <BuiltinIcon icon="close" :size="18" />
      </HstButton>
    </nav>
  </header>
</template>

<style scoped>
.viewer-header { position: relative; z-index: 3; display: flex; align-items: flex-start; flex-wrap: wrap; gap: 10px; padding: 14px; }
.title-pill { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 8px 12px 8px 14px; min-width: 0; max-width: 100%; }
.identity { flex: 1; min-width: 0; }.identity code { margin-left: 4px; }h2 { margin: 0; font-size: 14px; font-weight: 700; overflow-wrap: anywhere; }small { display: block; font-size: 11px; color: var(--histoire-muted); overflow-wrap: anywhere; }
.status { display: flex; align-items: center; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
.status-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--histoire-muted); }
.status-dot[data-tone=accent] { background: var(--histoire-accent); }.status-dot[data-tone=warn] { background: var(--histoire-warn); }.status-dot[data-tone=danger] { background: var(--histoire-danger); }
.divider { width: 1px; height: 24px; background: var(--histoire-border); }.ratio, .dimensions { font-size: 11px; white-space: nowrap; }.dimensions { color: var(--histoire-muted); }.ratio[data-tone=warn] { color: var(--histoire-warn); }.ratio[data-tone=danger] { color: var(--histoire-danger-text); }
.warnings { align-self: center; }.warning-chip { color: var(--histoire-warn); font-size: 12px; white-space: nowrap; }
.warning-panel { position: absolute; top: calc(100% - 8px); left: 14px; width: min(480px, calc(100% - 28px)); max-height: 240px; overflow: auto; padding: 12px; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }.warning-panel p { margin: 0; }.warning-panel p + p { margin-top: 8px; }
.navigation { display: flex; align-items: center; gap: 10px; margin-left: auto; }.pager { display: flex; align-items: center; gap: 2px; padding: 2px; }.pager code { padding: 0 6px; font-size: 12px; color: var(--histoire-muted); white-space: nowrap; }.pager code span { color: var(--histoire-text); }.close-button { --histoire-icon-button-size: 38px; }
@container (max-width: 640px) { .viewer-header { padding: 10px; gap: 8px; }.title-pill { width: 100%; }.warnings { margin-right: auto; }.warning-panel { left: 10px; width: calc(100% - 20px); } }
</style>
