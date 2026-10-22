<script setup lang="ts">
import type { UiAiThread, UiCommentAgent } from '@histoire/shared'
import type { AiThreadReplyExtra } from '../../stores/ai-threads.js'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { computed, ref, watch } from 'vue'
import { isThreadBusy } from '../../stores/agent-threads.js'
import { useAiThreads } from '../../stores/ai-threads.js'

import CommentContext from './CommentContext.vue'
import { agentDisplay, useCommentDestination } from './destination.js'
import AgentPrompt from './prompt/AgentPrompt.vue'
import { PLAN_FOLLOW_UP_PLACEHOLDER, usePlanFollowUp } from './prompt/plan-follow-up.js'
import { useReplyDrafts } from './reply-draft.js'
import AgentLiveTail from './thread/AgentLiveTail.vue'
import AgentPendingInput from './thread/questions/AgentPendingInput.vue'
import { useStickToBottom } from './thread/stick-to-bottom.js'
import ThreadMessage from './thread/ThreadMessage.vue'

const props = defineProps<{
  /** Persisted pinned thread with server-owned statuses. */
  thread: UiAiThread
  /** Collected story and variant display label. */
  title: string
  /** Current safe agent display states. */
  agents: readonly UiCommentAgent[]
  /** Disconnected/static sessions retain readable history. */
  disabled?: boolean
}>()
const emit = defineEmits<{
  /** Persist reply and continue its ACP conversation; `agentId` is used when the comment was never sent. */
  reply: [id: string, body: string, extra: AiThreadReplyExtra]
  /** Toggle persisted resolved status. */
  resolve: [resolved: boolean]
  /** Remove persisted comment. */
  remove: []
  /** Dismiss floating thread. */
  close: []
}>()
const model = useAiThreads()
/** Live output of the working agent, if any. */
const live = computed(() => model?.streaming.value[props.thread.id])
const scroller = ref<HTMLElement>()
const log = ref<HTMLElement>()
// Re-pin when another thread opens or a message is added (own reply, final agent answer).
useStickToBottom(scroller, log, () => `${props.thread.id}:${props.thread.thread.length}`)
const busy = computed(() => isThreadBusy(props.thread))
/** Destination for a comment that never reached an agent; bound conversations keep theirs. */
const { agentId, usable, choose, reset } = useCommentDestination(() => props.agents)
watch(() => props.thread.id, reset)
/** Reply drafts per comment; session choices stay with the agent they were made for. */
const { draft, edit, options, choose: chooseOptions, sent } = useReplyDrafts(() => props.thread.id, () => props.thread.agentId ?? agentId.value)
const prompt = ref<InstanceType<typeof AgentPrompt>>()
/** Latest reply kept planning: ask what should change. */
const keptPlanning = usePlanFollowUp(() => props.thread, prompt)
/** Configured display metadata for an agent id. */
function agent(id?: string): { name: string, icon?: string } {
  return agentDisplay(props.agents, id)
}
/** Each message belongs to exact saved thread; form submission cannot duplicate work. */
function submit() {
  const { body, attachments } = draft.value
  if (!body.trim() || busy.value || props.disabled) return
  const destination = props.thread.agentId ? undefined : agentId.value || undefined
  emit('reply', props.thread.id, body, { ...destination ? { agentId: destination } : {}, ...attachments.length ? { attachments } : {}, ...options.value ? { options: options.value } : {} })
  sent()
}
</script>

<template>
  <section class="comment-thread" aria-label="Comment conversation" @keydown.escape.stop.prevent="emit('close')">
    <CommentContext :title="title" :thread="thread" minimizable @minimize="emit('close')">
      <template #actions>
        <HstButton icon-only color="flat" type="button" :disabled="disabled" :aria-label="thread.status === 'resolved' ? 'Reopen comment' : 'Resolve comment'" :title="thread.status === 'resolved' ? 'Reopen' : 'Resolve'" @click="emit('resolve', thread.status !== 'resolved')">
          <BuiltinIcon :icon="thread.status === 'resolved' ? 'renew' : 'checkmark'" :size="16" />
        </HstButton>
        <HstButton icon-only color="flat" type="button" :disabled="disabled || busy" aria-label="Delete comment" title="Delete" @click="emit('remove')">
          <BuiltinIcon icon="trash-can" :size="16" />
        </HstButton>
      </template>
    </CommentContext>
    <div ref="scroller" class="thread-messages">
      <div ref="log">
        <ThreadMessage author="user" name="You" :at="thread.createdAt" :body="thread.body" :attachments="thread.attachments" />
        <ThreadMessage
          v-for="(message, index) in thread.thread"
          :key="index"
          :author="message.author"
          :name="message.author === 'agent' ? agent(message.agentId).name : 'You'"
          :icon="message.author === 'agent' ? agent(message.agentId).icon : undefined"
          :at="message.at"
          :body="message.body"
          :steps="message.steps"
          :plan="message.plan"
          :decisions="message.decisions"
          :changes="message.changes"
          :failed="message.failed"
          :attachments="message.attachments"
        />
        <ThreadMessage v-if="busy" author="agent" :name="agent(thread.agentId).name" :icon="agent(thread.agentId).icon" :body="live?.text ?? ''" :steps="live?.steps" :plan="live?.plan" streaming aria-live="polite">
          <AgentLiveTail :thread-id="thread.id" :steps="live?.steps ?? []" :text="live?.text ?? ''" :started-at="live?.startedAt" :queued="thread.status === 'sent'" />
        </ThreadMessage>
        <!-- Questions span the whole thread width, below the working reply. -->
        <AgentPendingInput v-if="busy" :thread-id="thread.id" />
      </div>
    </div>
    <form class="thread-reply" @submit.prevent="submit">
      <!-- Keyed by thread so a late upload of the previous thread cannot land in this draft. -->
      <AgentPrompt :key="thread.id" ref="prompt" :model-value="draft.body" :attachments="draft.attachments" :options="options ?? thread.options" compact label="Reply to comment" :placeholder="busy ? 'Agent is working…' : keptPlanning ? PLAN_FOLLOW_UP_PLACEHOLDER : 'Reply…'" :agents="thread.agentId ? agents : usable" :agent-id="thread.agentId ?? agentId" :agent-locked="Boolean(thread.agentId)" :busy="busy" :disabled="disabled" @update:model-value="edit({ body: $event })" @update:attachments="edit({ attachments: $event })" @update:options="chooseOptions" @choose="choose" @send="submit" />
    </form>
  </section>
</template>

<style scoped>
.comment-thread { width: 360px; max-width: calc(100vw - 24px); border-radius: var(--histoire-radius-panel); background: var(--histoire-surface); color: var(--histoire-text); box-shadow: var(--histoire-shadow-panel); overflow: hidden; }
.thread-messages { max-height: min(50vh, 400px); overflow: auto; padding: 16px 14px; }
.thread-reply { padding: 10px; border-top: 1px solid var(--histoire-border); }
</style>
