<script setup lang="ts">
import type { EmbedController } from './controller.js'
import { HstButton } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { ref } from 'vue'
import ToolbarPopover from '../canvas/toolbar/ToolbarPopover.vue'

const props = defineProps<{
  /** Owner keeps toolbar actions aligned with tree and frame registry eligibility. */
  controller: EmbedController
  /** Current toolbar popover identity. */
  open: string | null
}>()
const emit = defineEmits<{ 'update:open': [value: string | null] }>()
const snapshot = useHistoireSnapshot()
const popover = ref<InstanceType<typeof ToolbarPopover>>()

/** Capture selected target and native trigger before popover disappears. */
function open(scope: 'story' | 'variant'): void {
  const target = snapshot.value.selection
  if (!target || (scope === 'variant' && target.variantId === null)) return
  props.controller.open(target.storyId, scope === 'variant' ? target.variantId! : undefined, popover.value?.trigger)
  emit('update:open', null)
}
</script>

<template>
  <ToolbarPopover id="embed" ref="popover" :open="props.open" label="Embed" icon="code" :width="220" @update:open="emit('update:open', $event)">
    <HstButton color="flat" class="popover-row" :disabled="!snapshot.selection?.variantId || !controller.available(snapshot.selection.storyId, snapshot.selection.variantId)" @click="open('variant')">
      Embed this variant
    </HstButton>
    <HstButton color="flat" class="popover-row" :disabled="!snapshot.selection || !controller.available(snapshot.selection.storyId)" @click="open('story')">
      Embed this story
    </HstButton>
  </ToolbarPopover>
</template>
