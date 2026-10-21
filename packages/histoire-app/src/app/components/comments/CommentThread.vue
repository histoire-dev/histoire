<script setup lang="ts">
import type { UiComment, UiCommentAgent } from '@histoire/shared'
import { BuiltinIcon, HstButton, HstText } from '@histoire/controls/vue'
import { computed, ref } from 'vue'
import { useWorkbenchComments } from '../../stores/comments.js'

import CommentContext from './CommentContext.vue'
import AgentLiveTail from './thread/AgentLiveTail.vue'
import ThreadMessage from './thread/ThreadMessage.vue'

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
/** Live output of the working agent, if any. */
const live = computed(() => model?.streaming.value[props.comment.id])
const busy = computed(() => ['sent', 'working'].includes(props.comment.status))
/** Configured display metadata for an agent id, without inventing provider labels. */
function agent(id?: string): { name: string, icon?: string } {
  const found = props.agents.find(agent => agent.id === id)
  return { name: found?.name ?? id ?? 'Agent', icon: found?.icon }
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
    <CommentContext :title="title" :comment="comment" minimizable @minimize="emit('close')" />
    <div class="thread-messages">
      <ThreadMessage author="user" name="You" :at="comment.createdAt" :body="comment.body" />
      <ThreadMessage
        v-for="(message, index) in comment.thread"
        :key="index"
        :author="message.author"
        :name="message.author === 'agent' ? agent(message.agentId).name : 'You'"
        :icon="message.author === 'agent' ? agent(message.agentId).icon : undefined"
        :at="message.at"
        :body="message.body"
        :steps="message.steps"
        :changes="message.changes"
        :failed="message.failed"
      />
      <ThreadMessage v-if="busy" author="agent" :name="agent(comment.agentId).name" :icon="agent(comment.agentId).icon" :body="live?.text ?? ''" :steps="live?.steps" streaming aria-live="polite">
        <AgentLiveTail :steps="live?.steps ?? []" :text="live?.text ?? ''" :started-at="live?.startedAt" :queued="comment.status === 'sent'" />
      </ThreadMessage>
    </div>
    <form class="thread-actions" @submit.prevent="submit">
      <HstText v-model="reply" layout="inline" aria-label="Reply to comment" placeholder="Reply…" maxlength="8192" :disabled="disabled || busy" />
      <HstButton v-if="reply.trim()" icon-only color="flat" type="submit" :disabled="disabled || busy" aria-label="Send reply">
        <BuiltinIcon icon="send-alt-filled" :size="16" />
      </HstButton>
      <HstButton color="flat" type="button" class="resolve" :disabled="disabled" @click="emit('resolve', comment.status !== 'resolved')">
        <BuiltinIcon :icon="comment.status === 'resolved' ? 'renew' : 'checkmark'" :size="16" />{{ comment.status === 'resolved' ? 'Reopen' : 'Resolve' }}
      </HstButton>
      <HstButton icon-only color="flat" type="button" class="delete" :disabled="disabled || busy" aria-label="Delete comment" @click="emit('remove')">
        <BuiltinIcon icon="trash-can" :size="16" />
      </HstButton>
    </form>
  </section>
</template>

<style scoped>
.comment-thread { width: 360px; max-width: calc(100vw - 24px); border-radius: var(--histoire-radius-panel); background: var(--histoire-surface); color: var(--histoire-text); box-shadow: var(--histoire-shadow-panel); overflow: hidden; }
.thread-messages { max-height: min(50vh, 400px); overflow: auto; padding: 16px 14px; }
.thread-actions { display: flex; gap: 5px; padding: 10px; border-top: 1px solid var(--histoire-border); }
.histoire-text { flex: 1; min-width: 0; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 7px; color: inherit; }
.resolve { color: var(--histoire-accent-link); font-weight: 700; }.delete { color: var(--histoire-muted); }
</style>
