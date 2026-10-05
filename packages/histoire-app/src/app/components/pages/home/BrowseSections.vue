<script setup lang="ts">
import type { HistoireSelectionInput } from '@histoire/protocol'
import type { BrowseSection } from './catalog.js'
import { HstButton } from '@histoire/controls/vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

defineProps<{
  /** Real top-level folder/group counts and destinations. */
  sections: BrowseSection[]
  /** Dev overview uses compact cards with live status. */
  compact?: boolean
}>()
defineEmits<{
  /** Navigate to first real story within section. */
  select: [target: HistoireSelectionInput]
}>()
</script>

<template>
  <section v-if="sections.length" class="histoire-home-section">
    <h2>Browse</h2>
    <div class="histoire-browse-grid">
      <HstButton v-for="section in sections" :key="section.id" color="flat" type="button" class="histoire-browse-card" @click="$emit('select', section.target)">
        <div class="histoire-browse-card-header">
          <span class="histoire-browse-icon"><WorkbenchIcon :name="section.stories ? 'cube' : 'document'" /></span>
          <div><strong>{{ section.title }}</strong><span>{{ section.stories }} {{ section.stories === 1 ? 'story' : 'stories' }}<template v-if="section.variants"> · {{ section.variants }} variants</template><template v-if="section.guides"> · {{ section.guides }} guides</template></span></div>
          <slot name="status" :section="section" />
        </div>
        <p v-if="!compact">
          {{ section.storyTitles.slice(0, 5).join(', ') }}{{ section.storyTitles.length > 5 ? '…' : '' }}
        </p>
      </HstButton>
    </div>
  </section>
</template>

<style scoped>
h2 { margin: 0 0 14px; font-size: 15px; font-weight: 800; }
.histoire-browse-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.histoire-browse-card { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 18px; color: var(--histoire-text); text-align: left; }
.histoire-browse-card-header { display: flex; align-items: center; gap: 10px; width: 100%; }
.histoire-browse-card-header > div { flex: 1; min-width: 0; }
.histoire-browse-card-header strong { display: block; font-size: 13px; }
.histoire-browse-card-header > div > span { display: block; margin-top: 2px; color: var(--histoire-muted); font-size: 11px; }
.histoire-browse-icon { display: grid; flex: 0 0 36px; place-items: center; height: 36px; border-radius: 9px; background: var(--histoire-accent-soft, color-mix(in srgb, var(--histoire-accent) 10%, transparent)); color: var(--histoire-accent); }
.histoire-browse-icon > svg { width: 19px; height: 19px; }
.histoire-browse-card p { overflow: hidden; width: 100%; margin: 3px 0 0; color: var(--histoire-body, var(--histoire-muted)); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.histoire-browse-card:hover { border-color: var(--histoire-accent); }
.histoire-browse-card:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: 3px; }
@media (max-width: 1100px) { .histoire-browse-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .histoire-browse-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
