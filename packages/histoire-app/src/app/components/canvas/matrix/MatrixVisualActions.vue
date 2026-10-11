<script setup lang="ts">
import { HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import { ref } from 'vue'
import { useSelection } from '../../../composables/selection.js'
import { useMatrixStore } from '../../../stores/matrix.js'
import { useWorkbenchVisual } from '../../../stores/visual.js'
import { formatMatrixValue } from '../../../util/matrix-values.js'
import { snapshotScreenshotTargets } from '../../../util/screenshot-targets.js'

const props = defineProps<{
  /** Inspector captures selected cell; axis bar captures displayed filtered cells. */
  scope: 'selected' | 'all'
}>()
const matrix = useMatrixStore()
const visual = useWorkbenchVisual()
const { story, variant } = useSelection()
const error = ref('')

/** Snapshot full cell props before transport; saved cases survive browser storage reset. */
async function save(): Promise<void> {
  // Axis hints arrive before runtime defaults; wait for complete shared base props.
  if (!visual || !story.value || visual.saving.value || !matrix.metadataReady.value) {
    return
  }
  const variantId = variant.value?.id ?? story.value.variants[0]?.id
  if (!variantId) {
    return
  }
  const cells = props.scope === 'selected' ? matrix.selectedCell.value ? [matrix.selectedCell.value] : [] : [...matrix.cells.value]
  const storyId = story.value.id
  error.value = ''
  try {
    const targets = snapshotScreenshotTargets(cells.map(cell => ({ storyId, variantId, propsOverride: cell.props })))
    await visual.save(targets.map((target, index) => ({ ...target, label: `${story.value?.title ?? storyId} · ${matrix.rows.value}=${formatMatrixValue(cells[index].row)}, ${matrix.cols.value}=${formatMatrixValue(cells[index].col)}`, axes: { [matrix.rows.value]: cells[index].row, [matrix.cols.value]: cells[index].col } })))
    error.value = visual.issue.value
  }
  catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Saving visual cases failed'
  }
}
</script>

<template>
  <div v-if="visual" class="matrix-visual-actions">
    <HstButton color="flat" type="button" :disabled="visual.saving.value || !matrix.metadataReady.value || (scope === 'selected' ? !matrix.selectedCell.value : !matrix.cells.value.length)" @click="save">
      <HstPulsatingDisc v-if="visual.saving.value" :size="12" />{{ scope === 'selected' ? 'Add visual case' : 'Add visual cases' }}
    </HstButton>
    <p v-if="error" role="alert">
      {{ error }}
    </p>
  </div>
</template>

<style scoped>
.matrix-visual-actions { position: relative; flex-shrink: 0; }
p { position: absolute; z-index: 40; inset-inline-end: 0; top: 100%; width: 300px; max-height: 240px; overflow: auto; margin: 4px 0; padding: 12px; border: 1px solid var(--histoire-border); border-radius: 10px; background: var(--histoire-surface); color: var(--histoire-danger-text); box-shadow: 0 8px 24px rgb(0 0 0 / 12%); white-space: pre-line; font-size: 12px; }
</style>
