<script setup lang="ts">
import type { UiCommentMessage } from '@histoire/shared'
import { BuiltinIcon } from '@histoire/controls/vue'
import { computed } from 'vue'
import AgentLogo from '../../agents/AgentLogo.vue'
import { commentAge } from '../presentation.js'
import AttachmentStrip from '../prompt/AttachmentStrip.vue'
import { groupActivityPhases } from './activity-phases.js'
import AgentActivityPhase from './AgentActivityPhase.vue'
import AgentMarkdown from './AgentMarkdown.vue'

const props = defineProps<{
  /** Message origin. */
  author: UiCommentMessage['author']
  /** Display name. */
  name: string
  /** Agent registry logo URL. */
  icon?: string
  /** UTC message time; omitted while streaming. */
  at?: string
  /** Plain user text or agent markdown. */
  body: string
  /** Agent steps preceding the reply text. */
  steps?: UiCommentMessage['steps']
  /** Agent-reported file edits. */
  changes?: UiCommentMessage['changes']
  /** Agent request failure notice. */
  failed?: boolean
  /** Reply is still being produced. */
  streaming?: boolean
  /** Files attached to a user message. */
  attachments?: UiCommentMessage['attachments']
}>()
const phases = computed(() => groupActivityPhases(props.steps ?? []))
</script>

<template>
  <article class="thread-message" :class="{ 'agent-message': author === 'agent' }">
    <span class="avatar">
      <AgentLogo v-if="author === 'agent'" :icon="icon" :size="16" />
      <BuiltinIcon v-else icon="user-avatar" :size="16" />
    </span>
    <div>
      <header><strong>{{ name }}</strong><time v-if="at" :datetime="at" :title="at">{{ commentAge(at) }}</time></header>
      <div v-if="phases.length" class="phases">
        <AgentActivityPhase v-for="phase in phases" :key="phase.id" :phase="phase" />
      </div>
      <p v-if="failed" class="failed" role="alert">
        <BuiltinIcon icon="error-filled" :size="14" />{{ body }}
      </p>
      <AgentMarkdown v-else-if="author === 'agent' && body" :text="body" :streaming="streaming" />
      <p v-else-if="body" class="plain">
        {{ body }}
      </p>
      <AttachmentStrip v-if="attachments?.length" class="attachments" :attachments="attachments" linked />
      <code v-for="change in changes" :key="change.file" class="file-change"><BuiltinIcon icon="code" :size="16" />{{ change.file }} <span class="added">+{{ change.added }}</span><span class="removed">-{{ change.removed }}</span></code>
      <slot />
    </div>
  </article>
</template>

<style scoped>
.attachments { margin-top: 6px; }
.thread-message { display: flex; gap: 10px; margin: 0 0 18px; }
.thread-message:last-child { margin-bottom: 0; }
.thread-message > div { min-width: 0; flex: 1; }
.avatar { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--histoire-chip); color: var(--histoire-muted); }
.agent-message .avatar { background: var(--histoire-agent-soft); color: var(--histoire-agent-text); }
header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 7px; margin-bottom: 4px; }
strong { font-size: 12px; }
time { color: var(--histoire-muted); font-size: 11px; }
.phases { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1px; margin-bottom: 6px; }
p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--histoire-body); white-space: pre-wrap; overflow-wrap: anywhere; }
.failed { display: flex; align-items: center; gap: 6px; color: var(--histoire-danger-text); }
.file-change { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; width: fit-content; margin-top: 6px; padding: 5px 7px; border-radius: 6px; background: var(--histoire-chip); font-size: 10px; overflow-wrap: anywhere; }
.added { color: var(--histoire-accent-link); }
.removed { color: var(--histoire-danger-text); }
</style>
