<script setup lang="ts">
import { HstButton, HstSelect } from '@histoire/controls/vue'
import { useMatrixStore } from '../../../stores/matrix.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

const emit = defineEmits<{ axes: [value: { rows: string, cols: string }] }>()
const matrix = useMatrixStore()

/** Axis controls publish optional URL intent through standalone parent. */
function select(dimension: 'rows' | 'cols', value: string): void {
  matrix.selectAxes(dimension === 'rows' ? value : matrix.rows.value, dimension === 'cols' ? value : matrix.cols.value)
  emit('axes', { rows: matrix.rows.value, cols: matrix.cols.value })
}

/** Swapping preserves value filters attached to exact axis names. */
function swap(): void {
  matrix.swapAxes()
  emit('axes', { rows: matrix.rows.value, cols: matrix.cols.value })
}
</script>

<template>
  <div class="histoire-matrix-axis-bar" @pointerdown.stop @wheel.stop>
    <HstSelect title="Rows" layout="horizontal" :model-value="matrix.rows.value" :options="matrix.usableAxes.value.map(axis => ({ value: axis.name, label: axis.name, disabled: axis.name === matrix.cols.value }))" @update:model-value="select('rows', $event)" />
    <HstButton color="flat" type="button" aria-label="Swap matrix axes" @click="swap">
      <WorkbenchIcon name="arrows-horizontal" :size="16" />
    </HstButton>
    <HstSelect title="Columns" layout="horizontal" :model-value="matrix.cols.value" :options="matrix.usableAxes.value.map(axis => ({ value: axis.name, label: axis.name, disabled: axis.name === matrix.rows.value }))" @update:model-value="select('cols', $event)" />
    <span class="histoire-matrix-base-summary">Base props <code v-for="(value, name) in matrix.base.value" :key="name">{{ name }}={{ JSON.stringify(value) }}</code></span>
  </div>
</template>

<style scoped>
.histoire-matrix-axis-bar { display: flex; align-items: center; gap: 12px; min-width: 0; height: 36px; color: var(--histoire-muted); font-size: 11px; }
.histoire-matrix-axis-bar > .histoire-select { flex: 0 1 200px; min-width: 160px; --histoire-control-wrapper-padding: 0px; --histoire-control-margin: 0px; }
.histoire-matrix-axis-bar button { display: grid; place-items: center; width: 24px; height: 28px; padding: 0; }
.histoire-matrix-base-summary { display: flex; gap: 6px; overflow: hidden; margin-inline-start: auto; padding: 6px 10px; border: 1px dashed var(--histoire-border); border-radius: 7px; white-space: nowrap; }
.histoire-matrix-base-summary code { color: var(--histoire-text); }
@container (max-width: 900px) { .histoire-matrix-base-summary { display: none; } }
</style>
