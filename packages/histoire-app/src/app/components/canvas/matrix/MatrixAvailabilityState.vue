<script setup lang="ts">
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { useMatrixStore } from '../../../stores/matrix.js'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import WorkbenchLoadingState from '../../shell/WorkbenchLoadingState.vue'

defineProps<{
  /** Current discovery runtime failed before finite metadata was available. */
  failed?: boolean
}>()
const emit = defineEmits<{
  /** New-axis form opened; host reveals the inspector Props tab containing it. */
  addAxis: []
}>()
const matrix = useMatrixStore()

/** Open the custom axis form shared with the inspector. */
function addAxis(): void {
  matrix.axisEditor.add()
  emit('addAxis')
}
</script>

<template>
  <template v-if="!matrix.available.value">
    <WorkbenchEmptyState v-if="failed" icon="warning-alt" title="Could not read prop axes">
      Story runtime failed before prop values could be read.
    </WorkbenchEmptyState>
    <WorkbenchLoadingState v-else-if="!matrix.metadataReady.value" title="Reading prop axes" />
    <WorkbenchEmptyState v-else icon="data-table" title="Matrix needs two prop axes">
      <template v-if="matrix.usableAxes.value.length">
        Only <code>{{ matrix.usableAxes.value[0].name }}</code> has at least two known values.
      </template>
      <template v-else>
        No prop has at least two known values. Boolean and numeric props are detected automatically.
      </template>
      Add a custom axis with your own values, or declare them in <code>Story matrix.axes</code>.
      <template #actions>
        <HstButton color="flat" type="button" @pointerdown.stop @click="addAxis">
          <BuiltinIcon icon="add" :size="16" />
          Add custom axis
        </HstButton>
      </template>
    </WorkbenchEmptyState>
  </template>
  <WorkbenchEmptyState v-else-if="!matrix.cells.value.length" icon="data-table" title="No values selected">
    Enable row and column values in Props.
  </WorkbenchEmptyState>
</template>
