<script setup lang="ts">
import type { HistoireTarget } from '@histoire/protocol'
import { HstButtonGroup } from '@histoire/controls/vue'
import { useWorkbenchVisual } from '../../../stores/visual.js'
import VisualTestsPanel from '../visual/VisualTestsPanel.vue'
import FunctionalTestsPanel from './FunctionalTestsPanel.vue'

const emit = defineEmits<{ select: [target: HistoireTarget], error: [error: unknown] }>()
const visual = useWorkbenchVisual()
</script>

<template>
  <div class="tests-modes">
    <HstButtonGroup v-if="visual" v-model="visual.mode.value" class="mode-switch" layout="inline" aria-label="Test type" :options="[{ value: 'functional', label: 'Functional' }, { value: 'visual', label: 'Visual' }]" />
    <VisualTestsPanel v-if="visual?.mode.value === 'visual'" />
    <FunctionalTestsPanel v-else @select="emit('select', $event)" @error="emit('error', $event)" />
  </div>
</template>

<style scoped>
.tests-modes { display: flex; flex-direction: column; height: 100%; min-height: 0; }
/* Beats inline wrapper display and zero margin from controls stylesheet. */
.tests-modes > .mode-switch { display: flex; margin: 12px var(--histoire-pane-gutter) 0; }.tests-modes > section { flex: 1; min-height: 0; }
</style>
