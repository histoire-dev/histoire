<script setup lang="ts">
import type { HistoireTarget } from '@histoire/protocol'
import type { UiAiThread, UiCommentAgent } from '@histoire/shared'
import type { AiSection } from '../../../stores/shell.js'
import { BuiltinIcon, HstButton, HstButtonGroup } from '@histoire/controls/vue'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed, ref } from 'vue'
import { useContextMenu } from '../../../composables/context-menu.js'
import { useShell } from '../../../composables/shell.js'
import { useAiThreads } from '../../../stores/ai-threads.js'
import { isOnCanvas } from '../../comments/presentation.js'
import WorkbenchPaneToolbar from '../../shell/WorkbenchPaneToolbar.vue'
import McpContent from '../mcp/McpContent.vue'
import { useCaptureDiscoveryPause } from '../tests/capture.js'
import AiThreadComposer from './AiThreadComposer.vue'
import AiThreadList from './AiThreadList.vue'
import AiThreadView from './AiThreadView.vue'

const props = defineProps<{
  /** Current safe agent display states. */
  agents: readonly UiCommentAgent[]
  /** Capture the selected variant; absent without one. Resolves with the stored screenshot path. */
  capture?: () => Promise<string>
}>()
const emit = defineEmits<{
  /** Navigate to a story. */
  select: [target: HistoireTarget]
  /** Open a pinned thread's card on the canvas. */
  selectComment: [id: string]
  /** Open AI agent settings. */
  setupAgent: []
}>()
const shell = useShell()
/** Capture in flight; test discovery pauses meanwhile, like other captures. */
const capturing = ref<string | null>(null)
useCaptureDiscoveryPause(capturing)
/** Selected-variant capture wrapped with the discovery pause. */
const capture = computed(() => props.capture && (async () => {
  capturing.value = 'ai'
  try {
    return await props.capture!()
  }
  finally { capturing.value = null }
}))
const threads = useAiThreads()
const snapshot = useHistoireSnapshot()
const menu = useContextMenu()
/** Thread shown in the pane; a pinned thread with a live variant opens on the canvas instead. */
const paneThread = computed(() => {
  const thread = threads?.selectedThread.value
  return thread && !isOnCanvas(thread, snapshot.value.catalog.stories) ? thread : undefined
})
/** Thread actions keep exact thread and target identities. */
function openThreadMenu(event: MouseEvent | KeyboardEvent, thread: UiAiThread): void {
  const context = thread.context
  const selection = context && { storyId: context.storyId, variantId: context.variantId ?? null }
  menu?.open(event, {
    kind: 'comment',
    key: thread.id,
    label: thread.title,
    status: thread.status,
    ...(selection ? { selection } : {}),
    ...(selection?.variantId ? { frame: { storyId: selection.storyId, variantId: selection.variantId, frameKey: getHistoireTargetKey(selection) } } : {}),
  }, ['comment.open', 'comment.resolve', 'comment.reopen', 'comment.copy-text'])
}
const sections: { value: AiSection, label: string }[] = [
  { value: 'threads', label: 'Threads' },
  { value: 'mcp', label: 'MCP' },
]
</script>

<template>
  <section class="ai-panel" aria-label="AI">
    <WorkbenchPaneToolbar>
      <HstButtonGroup :model-value="shell.aiSection.value" layout="inline" aria-label="AI section" :options="sections" @update:model-value="shell.setAiSection" />
    </WorkbenchPaneToolbar>
    <McpContent v-if="shell.aiSection.value === 'mcp'" />
    <template v-else-if="threads">
      <p v-if="!threads.connected.value" class="ai-notice" role="status">
        AI threads disconnected
      </p>
      <p v-if="threads.error.value" class="ai-notice" role="alert">
        {{ threads.error.value }}
      </p>
      <AiThreadView v-if="paneThread" :thread="paneThread" :model="threads" :agents="agents" :capture="capture" @select="emit('select', $event)" />
      <AiThreadComposer v-else-if="threads.composing.value" :model="threads" :agents="agents" :capture="capture" @setup-agent="emit('setupAgent')" />
      <template v-else>
        <WorkbenchPaneToolbar>
          <HstButton icon-only color="flat" type="button" class="ai-action" aria-label="Show archived threads only" title="Archived threads" :aria-pressed="threads.showArchived.value" @click="threads.showArchived.value = !threads.showArchived.value">
            <BuiltinIcon icon="archive" :size="16" />
          </HstButton>
          <span class="ai-spacer" />
          <HstButton icon-only color="flat" type="button" class="ai-action" aria-label="New thread" title="New thread" :disabled="!threads.available.value" @click="threads.compose()">
            <BuiltinIcon icon="add" :size="16" />
          </HstButton>
        </WorkbenchPaneToolbar>
        <AiThreadList :model="threads" :agents="agents" @select-pin="emit('selectComment', $event)" @contextmenu="openThreadMenu" />
      </template>
    </template>
  </section>
</template>

<style scoped>
.ai-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--histoire-text); }
.ai-action { color: var(--histoire-muted); }
.ai-spacer { flex: 1; }
.ai-notice { margin: 0 var(--histoire-pane-gutter) 12px; color: var(--histoire-muted); font-size: 12px; }
</style>
