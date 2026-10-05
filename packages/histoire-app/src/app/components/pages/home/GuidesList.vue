<script setup lang="ts">
import type { HistoireCatalogStory, HistoireSelectionInput } from '@histoire/protocol'
import { HstButton } from '@histoire/controls/vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

defineProps<{
  /** Documentation-only stories in real tree order. */
  guides: HistoireCatalogStory[]
}>()
defineEmits<{
  /** Select documentation without mounting a preview variant. */
  select: [target: HistoireSelectionInput]
}>()
</script>

<template>
  <section v-if="guides.length" class="histoire-guides">
    <h2>Guides</h2>
    <HstButton v-for="guide in guides" :key="guide.id" color="flat" type="button" @click="$emit('select', { storyId: guide.id, variantId: null })">
      <WorkbenchIcon name="document" />
      <span>{{ guide.title }}</span>
      <WorkbenchIcon name="chevron-right" />
    </HstButton>
  </section>
</template>

<style scoped>
h2 { margin: 0 0 14px; font-size: 15px; font-weight: 800; }
.histoire-guides button { display: flex; align-items: center; gap: 10px; width: 100%; margin-bottom: 7px; padding: 12px 14px; color: var(--histoire-text); text-align: left; font-weight: 700; }
.histoire-guides span { flex: 1; }
.histoire-guides button > svg:first-child { color: var(--histoire-accent); }
.histoire-guides button:hover { color: var(--histoire-accent); }
</style>
