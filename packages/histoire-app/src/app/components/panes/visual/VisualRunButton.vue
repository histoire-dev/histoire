<script setup lang="ts">
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { computed, ref, shallowRef } from 'vue'
import { useWorkbenchVisual } from '../../../stores/visual.js'
import BasePopover from '../../base/popover/BasePopover.vue'
import MenuItem from '../../menu/MenuItem.vue'

const model = useWorkbenchVisual()!
const context = useHistoireContext()
const open = ref(false)
const chevron = shallowRef<InstanceType<typeof HstButton> | null>(null)
const anchor = computed(() => (chevron.value?.element as HTMLElement | undefined) ?? null)
const running = computed(() => !!model.requestId.value)
const disabled = computed(() => model.inventoryLoading.value || model.saving.value || model.approving.value || !model.cases.value.length)

/** Recapture every selected comparison, ignoring retained evidence. */
function runAll(): void {
  open.value = false
  model.start()
}
</script>

<template>
  <HstButton v-if="running" color="primary" type="button" class="run-visual" @click="model.cancel()">
    <BuiltinIcon icon="stop-filled-alt" :size="16" />Stop
  </HstButton>
  <div v-else class="run-visual-group">
    <HstButton color="primary" type="button" class="run-visual" :disabled="disabled" @click="model.start({ incremental: true })">
      <BuiltinIcon icon="play-filled-alt" :size="16" />Run
    </HstButton>
    <HstButton ref="chevron" color="primary" type="button" class="run-visual-options" icon-only aria-label="Run options" aria-haspopup="menu" :aria-expanded="open" :disabled="disabled" @click="open = !open">
      <BuiltinIcon icon="chevron-down" :size="16" />
    </HstButton>
    <BasePopover v-if="open" v-model:open="open" :anchor="anchor" label="Run options" role="menu" :width="160" :overlay-target="context.overlay.value ?? context.root.value">
      <MenuItem label="Run all" icon="renew" @click="runAll" />
    </BasePopover>
  </div>
</template>

<style scoped>
.run-visual-group { display: inline-flex; gap: 1px; }
.run-visual { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; font-weight: 750; }
.run-visual-group .run-visual { border-start-end-radius: 0; border-end-end-radius: 0; }
.run-visual-options { display: inline-flex; align-items: center; justify-content: center; padding: 8px 6px; border-start-start-radius: 0; border-end-start-radius: 0; }
</style>
