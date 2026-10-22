<script setup lang="ts">
import type { UiAiThread, UiCommentAgent } from '@histoire/shared'
import type { AiThreads } from '../../../stores/ai-threads.js'
import { BuiltinIcon, HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed } from 'vue'
import { isContextMenuShortcut } from '../../../composables/context-menu.js'
import { isThreadBusy } from '../../../stores/agent-threads.js'
import { useAgentsStore } from '../../../stores/agents.js'
import AgentLogo from '../../agents/AgentLogo.vue'
import { commentAge, groupThreads, isOnCanvas, pinNumbers } from '../../comments/presentation.js'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import WorkbenchPaneList from '../../shell/WorkbenchPaneList.vue'

const props = defineProps<{
  /** Shared AI threads state. */
  model: AiThreads
  /** Current safe agent display states. */
  agents: readonly UiCommentAgent[]
}>()
const emit = defineEmits<{
  /** Open a pinned thread's card on the canvas. */
  selectPin: [id: string]
  /** Row context menu, with the thread it targets. */
  contextmenu: [event: MouseEvent | KeyboardEvent, thread: UiAiThread]
}>()
const snapshot = useHistoireSnapshot()
const agentsStore = useAgentsStore()
/** Threads blocked on a question for the user. */
const needsInput = computed(() => new Set(agentsStore?.needsInput.value))
/** Selected story first, then the rest. */
const groups = computed(() => groupThreads(props.model.visible.value, snapshot.value.selection?.storyId))
/** Pin numbers follow all pinned threads, so filtering never renumbers them. */
const numbers = computed(() => pinNumbers(props.model.threads.value))
/** Registry logo of the thread agent, when known. */
function icon(agentId?: string): string | undefined {
  return props.agents.find(agent => agent.id === agentId)?.icon
}
/** Pinned threads with a live variant open on the canvas; others (orphans included) open in the pane. */
function select(thread: UiAiThread): void {
  if (isOnCanvas(thread, snapshot.value.catalog.stories)) emit('selectPin', thread.id)
  else props.model.open(thread.id)
}
/** Keyboard menu access without intercepting ordinary keys. */
function onKeydown(event: KeyboardEvent, thread: UiAiThread): void {
  if (isContextMenuShortcut(event)) emit('contextmenu', event, thread)
}
</script>

<template>
  <WorkbenchPaneList class="ai-thread-list">
    <section v-for="group in groups" :key="group.title" :aria-label="group.title">
      <h3>{{ group.title }}</h3>
      <ul>
        <li v-for="thread in group.threads" :key="thread.id">
          <button type="button" class="ai-thread-row" :data-archived="thread.status === 'resolved' || undefined" :aria-current="model.activeId.value === thread.id ? 'true' : undefined" @click="select(thread)" @contextmenu="emit('contextmenu', $event, thread)" @keydown="onKeydown($event, thread)">
            <span v-if="numbers.has(thread.id)" class="ai-thread-pin" :data-muted="thread.status === 'draft' || thread.status === 'resolved' || undefined" data-pin>{{ numbers.get(thread.id) }}</span>
            <AgentLogo v-else :icon="icon(thread.agentId)" :size="16" />
            <span class="ai-thread-title">{{ thread.title }}</span>
            <span v-if="needsInput.has(thread.id)" class="ai-thread-input" role="img" aria-label="Needs your input" title="Needs your input"><BuiltinIcon icon="help" :size="14" /></span>
            <HstPulsatingDisc v-else-if="isThreadBusy(thread)" :size="10" />
            <time v-else :datetime="thread.updatedAt">{{ commentAge(thread.updatedAt) }}</time>
          </button>
        </li>
      </ul>
    </section>
    <WorkbenchEmptyState v-if="!groups.length && model.showArchived.value" icon="archive" title="No archived threads" />
    <WorkbenchEmptyState v-else-if="!groups.length" icon="bot" title="No threads">
      <template #actions>
        <HstButton color="flat" type="button" :disabled="!model.available.value" @click="model.compose()">
          New thread
        </HstButton>
      </template>
    </WorkbenchEmptyState>
  </WorkbenchPaneList>
</template>

<style scoped>
ul { margin: 0; padding: 0; list-style: none; }
h3 { margin: 0; padding: 12px var(--histoire-pane-row-inset) 6px; color: var(--histoire-muted); font-size: 11px; font-weight: 700; }
.ai-thread-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: var(--histoire-list-row-padding) var(--histoire-pane-row-inset); border: 0; border-radius: var(--histoire-radius-control, 6px); background: none; color: var(--histoire-text); font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.ai-thread-row:hover, .ai-thread-row:focus-visible { background: var(--histoire-chip); }
.ai-thread-row[aria-current] { background: var(--histoire-agent-soft); }
.ai-thread-row[data-archived] { color: var(--histoire-muted); }
/* Matches the canvas pin: speech bubble with its tail at the bottom-left. */
.ai-thread-pin { display: grid; place-items: center; flex: none; width: 18px; height: 19px; border-radius: 50% 50% 50% 3px; background: var(--histoire-agent); color: #fff; font-size: 9px; font-weight: 700; }
.ai-thread-pin[data-muted] { background: var(--histoire-muted); }
.ai-thread-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-thread-input { display: flex; flex: none; color: var(--histoire-agent-text); }
time { flex: none; color: var(--histoire-muted); font-size: 11px; }
</style>
