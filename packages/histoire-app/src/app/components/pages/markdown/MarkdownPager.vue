<script setup lang="ts">
import type { HistoireCatalogStory, HistoireSelectionInput } from '@histoire/protocol'
import { HstButton } from '@histoire/controls/vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

defineProps<{
  /** Previous guide in same-group tree order. */
  previous?: HistoireCatalogStory
  /** Next guide in same-group tree order. */
  next?: HistoireCatalogStory
}>()
defineEmits<{
  /** Guide selection never mounts synthetic variants. */
  select: [target: HistoireSelectionInput]
}>()
</script>

<template>
  <nav v-if="previous || next" class="histoire-markdown-pager" aria-label="Documentation pages">
    <HstButton v-if="previous" color="flat" type="button" @click="$emit('select', { storyId: previous.id, variantId: null })">
      <WorkbenchIcon name="chevron-left" /><div><small>Previous</small><strong>{{ previous.title }}</strong></div>
    </HstButton>
    <HstButton v-if="next" color="flat" type="button" class="next" @click="$emit('select', { storyId: next.id, variantId: null })">
      <div><small>Next</small><strong>{{ next.title }}</strong></div><WorkbenchIcon name="chevron-right" />
    </HstButton>
  </nav>
</template>

<style scoped>
.histoire-markdown-pager { display: flex; gap: 12px; margin-top: 28px; }
button { display: flex; flex: 1; align-items: center; gap: 12px; min-width: 0; padding: 18px 16px; color: var(--histoire-text); text-align: left; }
button > div { flex: 1; min-width: 0; }
button.next:last-child { margin-left: auto; }
small { display: block; margin-bottom: 6px; color: var(--histoire-muted); font-size: 11px; }
strong { display: block; }
button:hover { border-color: var(--histoire-accent); }
</style>
