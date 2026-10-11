<script setup lang="ts">
import type { HistoireCatalogStory, HistoireSelectionInput } from '@histoire/protocol'
import type { HistoireBuildInfo } from '@histoire/shared'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { computed, ref } from 'vue'

const props = defineProps<{
  /** Published change identities; omitted when Git diff is unavailable. */
  changed?: HistoireBuildInfo['changed']
  /** Current live catalog resolves labels and retired story identities. */
  stories: readonly HistoireCatalogStory[]
  /** Dev labels working-tree changes; static labels release changes. */
  dev?: boolean
}>()
defineEmits<{
  /** Select a known changed story. */
  select: [target: HistoireSelectionInput]
}>()
const expanded = ref(false)
const changes = computed(() => (props.changed ?? []).flatMap((change) => {
  const story = props.stories.find(story => story.id === change.storyId)
  return story ? [{ ...change, story }] : []
}))
const visible = computed(() => expanded.value ? changes.value : changes.value.slice(0, 20))
</script>

<template>
  <section v-if="changes.length" class="histoire-updates">
    <h2>{{ dev ? 'Uncommitted changes' : 'Updated in this release' }} <span>{{ changes.length }}</span><small v-if="dev">DEV</small></h2>
    <div class="histoire-home-card">
      <HstButton v-for="change in visible" :key="change.storyId" color="flat" type="button" class="histoire-home-row" @click="$emit('select', change.story.docsOnly ? { storyId: change.storyId, variantId: null } : { storyId: change.storyId })">
        <BuiltinIcon :icon="change.story.docsOnly ? 'document' : 'cube'" :size="16" />
        <span>{{ change.story.title }}</span>
        <small :data-kind="change.kind">{{ change.kind === 'new' ? 'New' : 'Changed' }}</small>
      </HstButton>
      <HstButton v-if="!expanded && changes.length > 20" color="flat" type="button" class="histoire-home-row histoire-updates-more" @click="expanded = true">
        +{{ changes.length - 20 }} more
      </HstButton>
    </div>
  </section>
</template>

<style scoped>
.histoire-home-row > svg { color: var(--histoire-accent); }
.histoire-home-row > small { flex: none; padding: 2px 6px; border-radius: 5px; background: var(--histoire-chip); color: var(--histoire-muted); font-size: 10px; font-weight: 700; }
.histoire-home-row > small[data-kind="new"] { background: var(--histoire-accent-soft, color-mix(in srgb, var(--histoire-accent) 12%, transparent)); color: var(--histoire-accent); }
.histoire-updates-more { justify-content: center; color: var(--histoire-muted); font-size: 12px; }
.histoire-updates-more:hover { color: var(--histoire-text); }
</style>
