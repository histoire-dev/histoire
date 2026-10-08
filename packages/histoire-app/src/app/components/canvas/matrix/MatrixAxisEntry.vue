<script setup lang="ts">
import type { MatrixValue } from '../../../util/matrix.js'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { computed, ref } from 'vue'
import { isNumericMatrixAxis } from '../../../stores/matrix-preferences.js'
import { useMatrixStore } from '../../../stores/matrix.js'
import { equalMatrixValue, formatMatrixCustomValues, formatMatrixValue, matrixValueKey } from '../../../util/matrix-values.js'
import { filterMatrixValues } from '../../../util/matrix.js'
import MatrixCustomValues from './MatrixCustomValues.vue'
import MatrixNumericValues from './MatrixNumericValues.vue'

const props = defineProps<{
  /** Exact axis name. */
  name: string
  /** Selected dimension; unselected custom axes render a compact summary without filters. */
  dimension?: 'rows' | 'cols'
}>()
const matrix = useMatrixStore()
const editor = matrix.axisEditor
const error = ref('')
const axis = computed(() => matrix.axes.value.find(axis => axis.name === props.name))
const custom = computed(() => Object.hasOwn(matrix.customAxes.value, props.name))
/** Custom axes always use the line editor, even when all values are numbers. */
const numeric = computed(() => !custom.value && !!axis.value && isNumericMatrixAxis(axis.value, matrix.props.value))
const open = computed(() => editor.editing.value === props.name && (custom.value || numeric.value))
const values = computed(() => matrix.customAxes.value[props.name] ?? axis.value?.values ?? [])
const filter = computed(() => props.dimension === 'rows' ? matrix.rowValues.value : props.dimension === 'cols' ? matrix.colValues.value : undefined)
/** Compact one-line summary using editor notation, so `"2"` and `2` stay distinct. */
const summary = computed(() => formatMatrixCustomValues(values.value).split('\n').join(', '))
const selected = computed(() => axis.value ? filterMatrixValues(axis.value, filter.value) : [])

/** Toggle this axis editor; opening it closes any other one. */
function toggle(): void {
  if (open.value) editor.close()
  else editor.edit(props.name)
}

/** Close this editor only when it still owns the shared editing slot. */
function close(): void {
  if (editor.editing.value === props.name) editor.close()
}

/** Axis subsets are multi-selection filters, including intentionally empty sets. */
function toggleValue(value: MatrixValue): void {
  if (!props.dimension || !axis.value) return
  const active = selected.value.some(item => equalMatrixValue(item, value))
  matrix.setFilter(props.dimension, active ? selected.value.filter(item => !equalMatrixValue(item, value)) : [...selected.value, value])
}

/** Removal restores current source defaults, or retires the axis entirely. */
function remove(): void {
  try {
    matrix.removeCustomAxis(props.name)
    error.value = ''
    close()
  }
  catch (cause) { error.value = (cause as Error).message }
}
</script>

<template>
  <div class="histoire-matrix-axis" :data-open="open || undefined">
    <div class="histoire-matrix-axis-title">
      <code>{{ name }}</code>
      <span v-if="dimension" class="histoire-matrix-axis-meta" data-accent>{{ dimension === 'rows' ? 'rows' : 'columns' }} · {{ selected.length }} of {{ values.length }}</span>
      <span v-else class="histoire-matrix-axis-meta" :title="summary">{{ summary }}</span>
      <span class="histoire-matrix-axis-actions">
        <HstButton v-if="custom || numeric" icon-only color="flat" type="button" :aria-label="`Edit ${name} values`" title="Edit values" :aria-pressed="open" @click="toggle">
          <BuiltinIcon icon="edit" :size="14" />
        </HstButton>
        <HstButton v-if="custom" icon-only color="flat" type="button" :aria-label="`Remove ${name} axis`" title="Remove custom axis" @click="remove">
          <BuiltinIcon icon="trash-can" :size="14" />
        </HstButton>
      </span>
    </div>
    <div v-if="dimension && axis" class="histoire-matrix-value-filter histoire-button-group-options" role="group" :aria-label="`${name} values`">
      <HstButton v-for="value in axis.values" :key="matrixValueKey(value)" :title="formatMatrixValue(value)" color="flat" type="button" :aria-pressed="selected.some(item => equalMatrixValue(item, value))" @click="toggleValue(value)">
        {{ formatMatrixValue(value) }}
      </HstButton>
    </div>
    <span v-if="error" role="alert">{{ error }}</span>
    <MatrixCustomValues v-if="open && custom" :name="name" @close="close" />
    <MatrixNumericValues v-else-if="open" :key="name" :name="name" @close="close" />
  </div>
</template>

<style scoped>
.histoire-matrix-axis { display: grid; gap: 8px; min-width: 0; margin-bottom: 16px; }
.histoire-matrix-axis-title { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 24px; font-family: var(--histoire-font-mono); font-size: 11px; }
.histoire-matrix-axis-title code { flex: none; color: var(--histoire-text); font-size: 12px; }
.histoire-matrix-axis-meta { flex: 1; min-width: 0; overflow: hidden; color: var(--histoire-muted); text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.histoire-matrix-axis-meta[data-accent] { color: var(--histoire-accent-link); }
.histoire-matrix-axis-actions { display: flex; flex: none; gap: 2px; margin-inline-end: -4px; }
.histoire-matrix-axis-actions button { --histoire-icon-button-size: 24px; color: var(--histoire-muted); }
.histoire-matrix-axis-actions button:hover, .histoire-matrix-axis-actions button[aria-pressed="true"] { color: var(--histoire-text); }
.histoire-matrix-axis-actions:empty { display: none; }
.histoire-matrix-value-filter button { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
[role="alert"] { color: var(--histoire-danger); font-size: 12px; }
</style>
