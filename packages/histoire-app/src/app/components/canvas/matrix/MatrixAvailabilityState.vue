<script setup lang="ts">
import { useMatrixStore } from '../../../stores/matrix.js'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import WorkbenchLoadingState from '../../shell/WorkbenchLoadingState.vue'

defineProps<{
  /** Current discovery runtime failed before finite metadata was available. */
  failed?: boolean
}>()
const matrix = useMatrixStore()
</script>

<template>
  <template v-if="!matrix.available.value">
    <WorkbenchEmptyState v-if="failed" icon="warning-alt" title="Could not read prop axes">
      Story runtime failed before prop values could be read.
    </WorkbenchEmptyState>
    <WorkbenchLoadingState v-else-if="!matrix.metadataReady.value" title="Reading prop axes" />
    <WorkbenchEmptyState v-else icon="data-table" title="Matrix needs two prop axes">
      <template v-if="matrix.usableAxes.value.length">
        Found 1 usable axis: <code>{{ matrix.usableAxes.value[0].name }}</code>.
        Each axis needs at least two known values.
        Declare finite values in <code>Story matrix.axes</code> for another prop.
      </template>
      <template v-else>
        No usable prop axes found. Each axis needs at least two known values.
        Boolean props are detected automatically; declare other finite values in <code>Story matrix.axes</code>.
      </template>
    </WorkbenchEmptyState>
  </template>
  <WorkbenchEmptyState v-else-if="!matrix.cells.value.length" icon="data-table" title="No values selected">
    Enable row and column values in Props.
  </WorkbenchEmptyState>
</template>
