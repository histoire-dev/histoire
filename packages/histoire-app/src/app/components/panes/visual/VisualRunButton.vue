<script setup lang="ts">
import { computed } from 'vue'
import { useWorkbenchVisual } from '../../../stores/visual.js'
import MenuItem from '../../menu/MenuItem.vue'
import WorkbenchPanelAction from '../../shell/WorkbenchPanelAction.vue'

const model = useWorkbenchVisual()!
const running = computed(() => !!model.requestId.value)
const disabled = computed(() => model.inventoryLoading.value || model.saving.value || model.approving.value || !model.cases.value.length)

/** Recapture every selected comparison, ignoring retained evidence. */
function runAll(close: () => void): void {
  close()
  model.start()
}
</script>

<template>
  <WorkbenchPanelAction v-if="running" icon="stop-filled-alt" label="Stop" @click="model.cancel()" />
  <WorkbenchPanelAction v-else icon="play-filled-alt" label="Run" :disabled="disabled" @click="model.start({ incremental: true })">
    <template #menu="{ close }">
      <MenuItem label="Run all" icon="renew" @click="runAll(close)" />
    </template>
  </WorkbenchPanelAction>
</template>
