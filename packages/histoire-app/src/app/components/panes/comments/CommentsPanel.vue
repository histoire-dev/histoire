<script setup lang="ts">
import type { UiComment, UiCommentAgent } from '@histoire/shared'
import type { WorkbenchComments } from '../../../stores/comments.js'
import type { CommentsFilter } from '../../comments/presentation.js'
import { HstButton, HstButtonGroup, HstSelect } from '@histoire/controls/vue'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, ref, shallowRef } from 'vue'
import CommentThread from '../../comments/CommentThread.vue'
import { useCommentDestination } from '../../comments/destination.js'
import { filterComments, groupComments } from '../../comments/presentation.js'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'
import CommentsList from './CommentsList.vue'

const props = defineProps<{
  /** Explicit shell-owned comments instance shared with canvas. */
  model: WorkbenchComments
  /** Safe configured agent display metadata. */
  agents: readonly UiCommentAgent[]
}>()
const emit = defineEmits<{
  /** Navigate existing targets and expose canvas thread. */
  select: [comment: UiComment]
  /** Open configured AI settings when no agent is available. */
  setupAgent: []
}>()
const { session } = useHistoireContext()
const snapshot = shallowRef(session.getSnapshot())
useHistoireResource(session.subscribe(value => snapshot.value = value))
const filter = ref<CommentsFilter>('open')
const filters: { value: CommentsFilter, label: string }[] = [{ value: 'open', label: 'Open' }, { value: 'resolved', label: 'Resolved' }, { value: 'all', label: 'All' }]
/** Current counts share one exact filter value with segmented control. */
const filterOptions = computed(() => filters.map(item => ({ value: item.value, label: `${item.label} ${filterComments(props.model.comments.value, item.value).length}` })))
const visible = computed(() => filterComments(props.model.comments.value, filter.value))
const groups = computed(() => groupComments(visible.value, snapshot.value.catalog.stories))
const drafts = computed(() => props.model.comments.value.filter(comment => comment.status === 'draft'))
const { usable: agents, agentId, choose, reset } = useCommentDestination(() => props.agents)
const orphan = computed(() => props.model.selected.value && !snapshot.value.catalog.stories.some(story => story.id === props.model.selected.value?.storyId && story.variants.some(variant => variant.id === props.model.selected.value?.variantId)))

/** Retain removed stories' readable thread, while known targets navigate via standalone. */
function select(comment: UiComment) {
  props.model.open(comment.id)
  emit('select', comment)
}
/** Accepted bulk sends require a fresh destination under ask-each-time policy. */
function sendDrafts() {
  if (agentId.value && props.model.send(drafts.value.map(comment => comment.id), agentId.value)) reset()
}
</script>

<template>
  <section class="comments-panel" aria-label="Comments">
    <header class="comments-heading">
      <h2>Comments</h2><HstButton color="flat" type="button" aria-label="Show resolved comment pins" :aria-pressed="model.showResolved.value" @click="model.toggleResolved">
        <WorkbenchIcon name="filter" />
      </HstButton>
    </header>
    <HstButtonGroup v-model="filter" layout="inline" class="comments-filters" aria-label="Comment status" :options="filterOptions" />
    <p v-if="!model.connected.value" class="comments-notice" role="status">
      Comments disconnected
    </p>
    <p v-else-if="!model.enabled.value" class="comments-notice" role="status">
      Comments disabled
    </p>
    <p v-if="model.error.value" class="comments-notice" role="alert">
      {{ model.error.value }}
    </p>
    <div class="comments-scroll">
      <CommentsList :groups="groups" :comments="model.comments.value" :stories="snapshot.catalog.stories" :active-id="model.activeId.value" :agents="agents" @select="select" /><p v-if="!visible.length && model.available.value" class="comments-notice">
        No {{ filter === 'all' ? '' : `${filter} ` }}comments
      </p>
    </div>
    <CommentThread v-if="orphan && model.selected.value" :comment="model.selected.value" :title="`${model.selected.value.storyId} › ${model.selected.value.variantId}`" :agents="agents" :disabled="!model.available.value" @reply="(id, body) => model.reply(id, body)" @resolve="model.resolve(model.selected.value!.id, $event)" @remove="model.remove(model.selected.value!.id)" @close="model.dismiss" />
    <footer>
      <template v-if="agents.length">
        <HstSelect layout="inline" :model-value="agentId" aria-label="Bulk comment agent" placeholder="Choose agent" :options="agents.map(agent => ({ value: agent.id, label: agent.name }))" @update:model-value="choose" /><HstButton color="flat" type="button" :disabled="!drafts.length || !agentId || !model.available.value" @click="sendDrafts">
          <WorkbenchIcon name="send-alt-filled" />Send {{ drafts.length }} open
        </HstButton>
      </template>
      <HstButton v-else color="flat" type="button" @click="emit('setupAgent')">
        <WorkbenchIcon name="bot" />Set up an agent
      </HstButton>
    </footer>
  </section>
</template>

<style scoped>
.comments-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--histoire-text); }
.comments-heading { display: flex; align-items: center; justify-content: space-between; padding: 18px 16px; }.comments-heading h2 { font-size: 15px; font-weight: 800; margin: 0; }.comments-heading button { color: var(--histoire-muted); padding: 4px; }
.comments-filters { display: flex; margin: 3px 14px 0; }
.comments-scroll { flex: 1; min-height: 0; overflow: auto; padding: 0 8px 12px; }.comments-notice { margin: 18px 16px; color: var(--histoire-muted); font-size: 12px; }
footer { display: flex; align-items: center; gap: 6px; padding: 11px 14px; border-top: 1px solid var(--histoire-border); }
footer .histoire-select { width: 110px; min-width: 0; }
footer button { flex: 1; min-height: 34px; font-weight: 700; }
footer svg { color: var(--histoire-agent); }
.comments-panel :deep(.comment-thread) { width: 100%; max-width: 100%; border-radius: 0; box-shadow: none; }
</style>
