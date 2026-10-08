<script setup lang="ts">
import { BuiltinIcon, HstButton, HstSelect, HstText, HstTextarea } from '@histoire/controls/vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useMatrixStore } from '../../../stores/matrix.js'
import { parseMatrixCustomValues } from '../../../util/matrix-values.js'
import MatrixAxisEntry from './MatrixAxisEntry.vue'
import './matrix-axis-form.css'

const matrix = useMatrixStore()
const editor = matrix.axisEditor
const prop = ref('')
const name = ref('')
const draft = ref('')
const error = ref('')
const form = ref<HTMLFormElement>()
const candidates = computed(() => matrix.props.value.filter(prop => !matrix.usableAxes.value.some(axis => axis.name === prop.name)))
const unselected = computed(() => Object.keys(matrix.customAxes.value).filter(name => name !== matrix.rows.value && name !== matrix.cols.value))
// Every opening starts a fresh draft, including requests from canvas guidance
// made before this inspector mounted.
watch(editor.adding, async (adding) => {
  prop.value = ''
  name.value = ''
  draft.value = ''
  error.value = ''
  if (!adding) return
  await nextTick()
  form.value?.scrollIntoView?.({ block: 'nearest' })
  form.value?.querySelector<HTMLElement>('input[aria-label="Prop name"]')?.focus()
}, { immediate: true })

/** New domains publish once, after name/domain/capacity/payload validation. */
function add(): void {
  const selected = (prop.value || name.value).trim()
  // Existing custom axes are edited in place instead of being silently replaced.
  if (Object.hasOwn(matrix.customAxes.value, selected)) {
    editor.edit(selected)
    return
  }
  try {
    matrix.setCustomAxis(selected, parseMatrixCustomValues(draft.value))
    editor.close()
  }
  catch (cause) { error.value = (cause as Error).message }
}
</script>

<template>
  <div class="histoire-matrix-custom-axes">
    <MatrixAxisEntry v-for="axisName in unselected" :key="axisName" :name="axisName" />
    <form v-if="editor.adding.value" ref="form" class="histoire-matrix-axis-form" aria-label="Add matrix axis" @submit.prevent="add" @keydown.esc.stop="editor.close">
      <HstSelect v-model="prop" title="Prop" aria-label="Prop" :options="[{ value: '', label: 'Custom name' }, ...candidates.map(prop => ({ value: prop.name, label: prop.name }))]" />
      <HstText v-if="!prop" v-model="name" title="Prop name" aria-label="Prop name" spellcheck="false" />
      <HstTextarea v-model="draft" title="Values" aria-label="Values" placeholder="One value per line" :rows="Math.min(Math.max(draft.split('\n').length, 3), 8)" spellcheck="false" @keydown.enter.ctrl.exact.prevent="add" @keydown.enter.meta.exact.prevent="add" />
      <span v-if="error" role="alert">{{ error }}</span>
      <div class="histoire-matrix-axis-form-actions">
        <HstButton color="flat" type="button" @click="editor.close">
          Cancel
        </HstButton>
        <HstButton color="primary" type="submit">
          Add axis
        </HstButton>
      </div>
    </form>
    <HstButton v-else class="histoire-matrix-add-axis" color="flat" type="button" @click="editor.add">
      <BuiltinIcon icon="add" :size="16" />
      Add axis
    </HstButton>
  </div>
</template>

<style scoped>
.histoire-matrix-custom-axes { display: grid; min-width: 0; }
.histoire-matrix-custom-axes .histoire-matrix-add-axis { width: 100%; border: 1px dashed var(--histoire-border); color: var(--histoire-muted); }
.histoire-matrix-custom-axes .histoire-matrix-add-axis:hover { border-color: var(--histoire-muted); color: var(--histoire-text); }
</style>
