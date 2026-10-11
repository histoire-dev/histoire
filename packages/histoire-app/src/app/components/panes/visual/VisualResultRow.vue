<script setup lang="ts">
import type { UiVisualResult } from '@histoire/shared'
import { BuiltinIcon, HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import { computed } from 'vue'
import { useWorkbenchVisual } from '../../../stores/visual.js'
import { visualStatus } from './status.js'

/** One case/profile comparison; label already omits story title shown by heading. */
const props = defineProps<{ result: UiVisualResult, label: string, approvable: boolean, selectable: boolean }>()
const model = useWorkbenchVisual()!
const status = computed(() => visualStatus(props.result))
/** Keep comparison status and diagnostic details available without crowding the row. */
const statusTitle = computed(() => model.approvalPending(props.result) ? 'Saving baseline' : [props.result.staleReason ? 'Stale' : status.value.label, props.result.staleReason ?? props.result.error ?? props.result.warning].filter(Boolean).join(': '))
const checked = computed(() => model.selectedIds.value.includes(props.result.id))

/** Independent toggles never imply approve-all. */
function toggle(): void {
  model.selectedIds.value = checked.value ? model.selectedIds.value.filter(value => value !== props.result.id) : [...model.selectedIds.value, props.result.id]
}
</script>

<template>
  <div class="visual-row" :data-tone="status.tone" :aria-current="model.selectedResultId.value === result.id ? 'true' : undefined">
    <span v-if="selectable" class="visual-row-check">
      <input v-if="approvable" type="checkbox" :disabled="model.approvalPending(result)" :aria-label="`Select ${result.case.label} ${result.spec.id} for approval`" :checked="checked" @change="toggle">
    </span>
    <button class="visual-row-main" type="button" :aria-label="`Review ${result.case.label} ${result.spec.id}, ${model.approvalPending(result) ? 'Saving baseline' : result.staleReason ? 'Stale' : status.label}`" :title="statusTitle" @click="model.review(result)">
      <HstPulsatingDisc v-if="model.busy(result) || model.approvalPending(result)" :size="12" />
      <BuiltinIcon v-else :icon="status.icon" :size="16" />
      <span class="visual-row-content">
        <span class="visual-row-label" :title="label">{{ label }}</span>
        <span class="visual-row-profile" :title="result.spec.id">{{ result.spec.id }}</span>
      </span>
    </button>
    <HstButton color="flat" icon-only type="button" class="visual-row-remove" :disabled="!!model.requestId.value || model.approvalPending(result)" :aria-label="`Run again ${result.case.label} ${result.spec.id}`" title="Run again" @click="model.rerun(result)">
      <BuiltinIcon icon="renew" :size="14" />
    </HstButton>
    <HstButton v-if="result.case.kind === 'matrix'" color="flat" icon-only type="button" class="visual-row-remove" :aria-label="`Remove saved case ${result.case.label}`" title="Remove saved case" @click="model.remove(result.case)">
      <BuiltinIcon icon="trash-can" :size="14" />
    </HstButton>
  </div>
</template>

<style scoped>
.visual-row { display: flex; align-items: center; gap: 4px; height: var(--histoire-virtual-row-height, 39px); padding: 0 4px; border-radius: 6px; }
.visual-row:hover, .visual-row[aria-current=true] { background: var(--histoire-accent-soft); }
.visual-row-check { display: grid; place-items: center; flex: none; width: 20px; }
.visual-row-check input { margin: 0; accent-color: var(--histoire-accent); cursor: pointer; }
.visual-row-main { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; height: 100%; padding: 0 4px; background: transparent; border: 0; color: var(--histoire-text); font: inherit; line-height: 18px; text-align: start; cursor: pointer; }
.visual-row-main:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: -2px; border-radius: 6px; }
.visual-row-main > svg { flex: none; color: var(--histoire-muted); }
.visual-row[data-tone=passed] .visual-row-main > svg { color: var(--histoire-accent); }
.visual-row[data-tone=danger] .visual-row-main > svg { color: var(--histoire-danger); }
.visual-row[data-tone=warn] .visual-row-main > svg { color: var(--histoire-warn); }
/* Two bounded text lines keep the case readable and reserve separate action space. */
.visual-row-content { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow: hidden; }
.visual-row-label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.visual-row-profile { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--histoire-muted); font-family: var(--histoire-font-mono); font-size: 11px; line-height: 14px; }
/* Destructive action stays out of the way until row is hovered or focused. */
.visual-row-remove { flex: none; opacity: 0; }
.visual-row:hover .visual-row-remove, .visual-row-remove:focus-visible { opacity: 1; }
</style>
