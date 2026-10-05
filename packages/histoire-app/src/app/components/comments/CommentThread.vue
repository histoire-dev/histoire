<script setup lang="ts">
import type { UiComment, UiCommentAgent } from '@histoire/shared'
import { HstButton, HstText } from '@histoire/controls/vue'
import { computed, ref } from 'vue'
import { useWorkbenchComments } from '../../stores/comments.js'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'
import CommentContext from './CommentContext.vue'
import { commentAge } from './presentation.js'

const props = defineProps<{
  /** Persisted conversation with server-owned statuses. */
  comment: UiComment
  /** Collected story and variant display label. */
  title: string
  /** Current safe agent display states. */
  agents: readonly UiCommentAgent[]
  /** Disconnected/static sessions retain readable history. */
  disabled?: boolean
}>()
const emit = defineEmits<{
  /** Persist reply and continue configured ACP conversation. */
  reply: [id: string, body: string]
  /** Toggle persisted resolved status. */
  resolve: [resolved: boolean]
  /** Remove persisted comment. */
  remove: []
  /** Dismiss floating thread. */
  close: []
}>()
/** Shared thread shells retain drafts by exact comment identity during live updates. */
const replies = ref<Record<string, string>>({})
const reply = computed({
  get: () => replies.value[props.comment.id] ?? '',
  set: (body: string) => { replies.value = { ...replies.value, [props.comment.id]: body } },
})
const model = useWorkbenchComments()
const streamed = computed(() => model?.streaming.value[props.comment.id]?.text ?? '')
const busy = computed(() => ['sent', 'working'].includes(props.comment.status))
/** Actual agent IDs map to configured display names without inventing provider labels. */
function agentName(id?: string): string {
  return props.agents.find(agent => agent.id === id)?.name ?? id ?? 'Agent'
}
/** Each message belongs to exact saved thread; form submission cannot duplicate work. */
function submit() {
  const body = reply.value
  if (!body.trim() || busy.value || props.disabled) return
  emit('reply', props.comment.id, body)
  reply.value = ''
}
</script>

<template>
  <section class="comment-thread" aria-label="Comment conversation" @keydown.escape.stop.prevent="emit('close')">
    <CommentContext :title="title" :comment="comment" />
    <div class="thread-messages">
      <article class="thread-message">
        <span class="avatar"><WorkbenchIcon name="user-avatar" /></span>
        <div><header><strong>You</strong><time :datetime="comment.createdAt" :title="comment.createdAt">{{ commentAge(comment.createdAt) }}</time></header><p>{{ comment.body }}</p></div>
      </article>
      <article v-for="(message, index) in comment.thread" :key="index" class="thread-message" :class="{ 'agent-message': message.author === 'agent' }">
        <span class="avatar"><WorkbenchIcon :name="message.author === 'agent' ? 'bot' : 'user-avatar'" /></span>
        <div>
          <header><strong>{{ message.author === 'agent' ? agentName(message.agentId) : 'You' }}</strong><time :datetime="message.at" :title="message.at">{{ commentAge(message.at) }}</time></header><p>{{ message.body }}</p>
          <code v-for="change in message.changes" :key="change.file" class="file-change"><WorkbenchIcon name="code" />{{ change.file }} <span class="added">+{{ change.added }}</span><span class="removed">-{{ change.removed }}</span></code>
        </div>
      </article>
      <article v-if="busy && streamed" class="thread-message agent-message" aria-live="polite">
        <span class="avatar"><WorkbenchIcon name="bot" /></span><div><header><strong>{{ agentName(comment.agentId) }}</strong></header><p>{{ streamed }}</p></div>
      </article>
      <p v-if="busy" class="agent-working" role="status">
        <WorkbenchIcon name="in-progress" />{{ agentName(comment.agentId) }} is working…
      </p>
    </div>
    <form class="thread-actions" @submit.prevent="submit">
      <HstText v-model="reply" layout="inline" aria-label="Reply to comment" placeholder="Reply…" maxlength="8192" :disabled="disabled || busy" />
      <HstButton v-if="reply.trim()" color="flat" type="submit" :disabled="disabled || busy" aria-label="Send reply">
        <WorkbenchIcon name="send-alt-filled" />
      </HstButton>
      <HstButton color="flat" type="button" class="resolve" :disabled="disabled" @click="emit('resolve', comment.status !== 'resolved')">
        <WorkbenchIcon :name="comment.status === 'resolved' ? 'renew' : 'checkmark'" />{{ comment.status === 'resolved' ? 'Reopen' : 'Resolve' }}
      </HstButton>
      <HstButton color="flat" type="button" class="delete" :disabled="disabled || busy" aria-label="Delete comment" @click="emit('remove')">
        <WorkbenchIcon name="trash-can" />
      </HstButton>
    </form>
  </section>
</template>

<style scoped>
.comment-thread { width: 360px; max-width: calc(100vw - 24px); border-radius: var(--histoire-radius-panel); background: var(--histoire-surface); color: var(--histoire-text); box-shadow: var(--histoire-shadow-panel); overflow: hidden; }
.thread-messages { max-height: min(50vh, 400px); overflow: auto; padding: 16px 14px; }
.thread-message { display: flex; gap: 10px; margin: 0 0 18px; }
.thread-message:last-child { margin-bottom: 0; }
.thread-message > div { min-width: 0; flex: 1; }
.avatar { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--histoire-chip); color: var(--histoire-muted); }
.agent-message .avatar { background: var(--histoire-agent-soft); color: var(--histoire-agent-text); }
.thread-message header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 7px; margin-bottom: 4px; }
.thread-message strong { font-size: 12px; }
time { color: var(--histoire-muted); font-size: 11px; }
p { margin: 0; font-size: 12px; line-height: 1.6; color: var(--histoire-body); white-space: pre-wrap; overflow-wrap: anywhere; }
.file-change { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; width: fit-content; margin-top: 6px; padding: 5px 7px; border-radius: 6px; background: var(--histoire-chip); font-size: 10px; overflow-wrap: anywhere; }
.added { color: var(--histoire-accent-link); }.removed { color: var(--histoire-danger-text); }
.agent-working { display: flex; gap: 6px; align-items: center; color: var(--histoire-agent-text); }
.thread-actions { display: flex; gap: 5px; padding: 10px; border-top: 1px solid var(--histoire-border); }
.histoire-text { flex: 1; min-width: 0; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 7px; color: inherit; }
.resolve { color: var(--histoire-accent-link); font-weight: 700; }.delete { color: var(--histoire-muted); }
</style>
