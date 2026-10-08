<script setup lang="ts">
import { BuiltinIcon, HstButton, HstSelect } from '@histoire/controls/vue'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, ref, useId, watch } from 'vue'
import { useSelection } from '../../../composables/selection.js'
import { useMatrixStore } from '../../../stores/matrix.js'
import { formatMatrixValue } from '../../../util/matrix-values.js'
import { matrixVariantSnippet } from '../../../util/matrix.js'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import MatrixAxisEntry from './MatrixAxisEntry.vue'
import MatrixBaseProp from './MatrixBaseProp.vue'
import MatrixCustomAxes from './MatrixCustomAxes.vue'

const emit = defineEmits<{ error: [error: unknown] }>()
const matrix = useMatrixStore()
const context = useHistoireContext()
const { session, story, variant } = useSelection()
const copying = ref(false)
const copied = ref(false)
/** Connect toolbar label to the inline preset select. */
const presetId = `histoire-matrix-preset-${useId()}`
const fields = computed(() => matrix.props.value.filter(prop => prop.name !== matrix.rows.value && prop.name !== matrix.cols.value))
const dimensions = computed(() => ([{ id: 'rows' as const, axis: matrix.rowAxis.value }, { id: 'cols' as const, axis: matrix.colAxis.value }]).filter(dimension => dimension.axis))
let active = true
useHistoireResource(() => {
  active = false
})
watch(() => matrix.selectedCell.value, () => copied.value = false)

/** Changing base preset reuses exact canonical selection and its source generator. */
function preset(id: string): void {
  if (!story.value) return
  void session.selection.select({ storyId: story.value.id, variantId: id }).catch(error => active && emit('error', error))
}

/** Reset base editing without touching canonical controls or selected variant. */
function reset(): void {
  matrix.resetBase(Object.fromEntries(fields.value.map(prop => [prop.name, prop.value])))
}

/** Framework-generated cell source is copied only while original cell still owns it. */
async function copyVariant(): Promise<void> {
  const cell = matrix.selectedCell.value
  if (!cell || copying.value) return
  copying.value = true
  try {
    const source = await matrix.sourceForSelected()
    if (!active || matrix.selectedCell.value?.props !== cell.props) return
    const clipboard = context.root.value?.ownerDocument.defaultView?.navigator.clipboard
    if (!clipboard) throw new Error('Clipboard unavailable')
    const tag = story.value?.supportPluginId?.includes('svelte') ? 'Hst.Variant' : 'Variant'
    await clipboard.writeText(matrixVariantSnippet(`${formatMatrixValue(cell.row)} · ${formatMatrixValue(cell.col)}`, source, tag))
    if (active && matrix.selectedCell.value?.props === cell.props) copied.value = true
  }
  catch (error) { if (active && matrix.selectedCell.value?.props === cell.props) emit('error', error) }
  finally { if (active) copying.value = false }
}
</script>

<template>
  <div class="histoire-matrix-inspector">
    <div class="histoire-matrix-preset">
      <label :for="presetId" class="histoire-matrix-preset-label">
        <BuiltinIcon icon="bookmark" :size="16" />
        <span>Base preset</span>
      </label>
      <HstSelect
        :id="presetId"
        title="Base preset"
        layout="inline"
        :model-value="variant?.id ?? story?.variants[0]?.id"
        :options="(story?.variants ?? []).map(item => ({ value: item.id, label: item.title }))"
        @update:model-value="preset"
      />
      <HstButton icon-only color="flat" type="button" aria-label="Reset matrix base props" title="Reset matrix base props" @click="reset">
        <BuiltinIcon icon="reset" :size="16" />
      </HstButton>
    </div>
    <div class="histoire-matrix-selected">
      <span>Selected cell</span>
      <dl v-if="matrix.selectedCell.value" class="histoire-matrix-selected-values">
        <div>
          <dt><code>{{ matrix.rowAxis.value!.name }}</code></dt>
          <dd>{{ formatMatrixValue(matrix.selectedCell.value.row) }}</dd>
        </div>
        <div>
          <dt><code>{{ matrix.colAxis.value!.name }}</code></dt>
          <dd>{{ formatMatrixValue(matrix.selectedCell.value.col) }}</dd>
        </div>
      </dl>
      <WorkbenchEmptyState v-else icon="grid" title="No cell selected" />
      <HstButton color="flat" type="button" :disabled="!matrix.canCopy.value || copying" @click="copyVariant">
        {{ copied ? 'Copied' : copying ? 'Copying…' : 'Save as variant' }}
      </HstButton>
    </div>
    <section aria-label="Matrix axes">
      <h3>Axes</h3>
      <MatrixAxisEntry v-for="dimension in dimensions" :key="dimension.id" :name="dimension.axis!.name" :dimension="dimension.id" />
      <MatrixCustomAxes />
    </section>
    <section aria-label="Matrix base props">
      <div class="histoire-matrix-base-title">
        <h3>Base props</h3><span>all {{ matrix.cells.value.length }} cells</span>
      </div>
      <MatrixBaseProp v-for="prop in fields" :key="prop.name" :prop="prop" :value="Object.hasOwn(matrix.base.value, prop.name) ? matrix.base.value[prop.name] : prop.value" :values="matrix.axes.value.find(axis => axis.name === prop.name)?.values" :edited="Object.hasOwn(matrix.base.value, prop.name) && !Object.is(matrix.base.value[prop.name], prop.value)" @update="matrix.setBase(prop.name, $event)" />
    </section>
    <output v-if="copied" class="histoire-matrix-copy-status" aria-live="polite">Variant snippet copied</output>
  </div>
</template>

<style scoped>
.histoire-matrix-inspector { padding: 0 var(--histoire-inspector-gutter, 16px) 16px; }
.histoire-matrix-preset {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 2px 0 20px;
}
.histoire-matrix-preset-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
  color: var(--histoire-muted);
  font-size: 12px;
  white-space: nowrap;
}
.histoire-matrix-preset > .histoire-select {
  flex: 1;
  min-width: 0;
}
.histoire-matrix-preset > button {
  color: var(--histoire-muted);
}
.histoire-matrix-selected { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 12px; border: 1px solid var(--histoire-border); border-radius: var(--histoire-radius-panel); background: transparent; font-size: 11px; color: var(--histoire-muted); }
.histoire-matrix-selected-values { display: flex; flex-direction: column; gap: 8px; margin: 0; color: var(--histoire-text); }
.histoire-matrix-selected-values > div { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
.histoire-matrix-selected-values :is(dt,dd) { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.histoire-matrix-selected-values code { font-family: var(--histoire-font-mono); }
.histoire-matrix-selected-values dd { text-align: right; }
.histoire-matrix-selected > .workbench-empty-state { margin: 8px 0; }
.histoire-matrix-selected > button { width: 100%; white-space: nowrap; }
.histoire-matrix-inspector h3 { margin: 22px 0 14px; color: var(--histoire-muted); font-size: 10px; font-weight: 800; text-transform: uppercase; }
.histoire-matrix-base-title { display: flex; align-items: baseline; justify-content: space-between; }
.histoire-matrix-base-title span { color: var(--histoire-muted); font-size: 10px; }
.histoire-matrix-copy-status { display: block; margin-top: 8px; color: var(--histoire-accent-link); font-size: 11px; }
</style>
