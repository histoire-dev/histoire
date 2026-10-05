<script setup lang="ts">
import type { HistoireCatalogStory, HistoireSelectionInput } from '@histoire/protocol'
import type { HistoireBuildInfo } from '@histoire/shared'
import { HstButton } from '@histoire/controls/vue'
import { computed, ref } from 'vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'

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
    <h2>{{ dev ? 'Changed since last commit' : 'Updated in this release' }} <small v-if="dev">DEV</small></h2>
    <HstButton v-for="change in visible" :key="change.storyId" color="flat" type="button" @click="$emit('select', change.story.docsOnly ? { storyId: change.storyId, variantId: null } : { storyId: change.storyId })">
      <WorkbenchIcon :name="change.story.docsOnly ? 'document' : 'cube'" />
      <span>{{ change.story.title }}</span>
      <small>{{ change.kind === 'new' ? 'New' : 'Changed' }}</small>
    </HstButton>
    <HstButton v-if="!expanded && changes.length > 20" color="flat" type="button" class="histoire-updates-more" @click="expanded = true">
      +{{ changes.length - 20 }} more
    </HstButton>
  </section>
</template>

<style scoped>
h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; font-size: 15px; font-weight: 800; }
h2 small { color: var(--histoire-muted); font-size: 9px; }
.histoire-updates button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 0; color: var(--histoire-text); text-align: left; }
.histoire-updates button > span { flex: 1; }
.histoire-updates button small { padding: 3px 6px; border-radius: 5px; background: var(--histoire-chip, var(--histoire-panel)); color: var(--histoire-muted); font-size: 10px; }
.histoire-updates button:hover, .histoire-updates-more { color: var(--histoire-accent); }
.histoire-updates button:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: 2px; }
</style>
