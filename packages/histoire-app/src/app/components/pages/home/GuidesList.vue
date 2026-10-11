<script setup lang="ts">
import type { HistoireCatalogStory, HistoireSelectionInput } from '@histoire/protocol'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'

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
    <div class="histoire-home-card">
      <HstButton v-for="guide in guides" :key="guide.id" color="flat" type="button" class="histoire-home-row" @click="$emit('select', { storyId: guide.id, variantId: null })">
        <BuiltinIcon icon="document" :size="16" />
        <span>{{ guide.title }}</span>
        <BuiltinIcon icon="chevron-right" :size="16" />
      </HstButton>
    </div>
  </section>
</template>

<style scoped>
.histoire-home-row { font-weight: 700; }
.histoire-home-row > svg:first-child { color: var(--histoire-accent); }
.histoire-home-row > svg:last-child { color: var(--histoire-muted); }
</style>
