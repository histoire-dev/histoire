<script setup lang="ts">
import type { HistoireTarget } from '@histoire/protocol'
import type { UiAiThread, UiCommentAgent } from '@histoire/shared'
import type { AiThreads } from '../../../stores/ai-threads.js'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { computed, ref, watch } from 'vue'
import { isThreadBusy } from '../../../stores/agent-threads.js'
import { agentDisplay, useCommentDestination } from '../../comments/destination.js'
import AgentPrompt from '../../comments/prompt/AgentPrompt.vue'
import { useReplyDrafts } from '../../comments/reply-draft.js'
import AgentLiveTail from '../../comments/thread/AgentLiveTail.vue'
import { useStickToBottom } from '../../comments/thread/stick-to-bottom.js'
import ThreadMessage from '../../comments/thread/ThreadMessage.vue'
import AiCreatedStories from './AiCreatedStories.vue'
import AiThreadHeader from './AiThreadHeader.vue'

const props = defineProps<{
  /** Open conversation. */
  thread: UiAiThread
  /** Shared AI threads state. */
  model: AiThreads
  /** Current safe agent display states. */
  agents: readonly UiCommentAgent[]
  /** Selected-variant screenshot capture, attached to the message. */
  capture?: () => Promise<string>
}>()
const emit = defineEmits<{
  /** Navigate to a story the agent created or changed. */
  select: [target: HistoireTarget]
}>()
const live = computed(() => props.model.streaming.value[props.thread.id])
const busy = computed(() => isThreadBusy(props.thread))
const disabled = computed(() => !props.model.available.value)
const scroller = ref<HTMLElement>()
const log = ref<HTMLElement>()
useStickToBottom(scroller, log, () => `${props.thread.id}:${props.thread.thread.length}`)
/** Destination for a thread whose first send failed; bound threads keep theirs. */
const { agentId, usable, choose, reset } = useCommentDestination(() => props.agents)
watch(() => props.thread.id, reset)
/** Reply drafts per thread; session choices stay with the agent they were made for. */
const { draft, edit, options, choose: chooseOptions, sent } = useReplyDrafts(() => props.thread.id, () => props.thread.agentId ?? agentId.value)
/** Files changed by every agent reply in the thread. */
const changes = computed(() => props.thread.thread.flatMap(message => message.changes ?? []))
/** Configured display metadata for an agent id. */
function agent(id?: string): { name: string, icon?: string } {
  return agentDisplay(props.agents, id)
}
/** Send the reply once; the draft clears only when the channel accepted it. */
function submit() {
  const { body, attachments } = draft.value
  if (!body.trim() || busy.value || disabled.value) return
  const destination = props.thread.agentId ? undefined : agentId.value || undefined
  if (props.model.reply(props.thread.id, body, { ...destination ? { agentId: destination } : {}, ...attachments.length ? { attachments } : {}, ...options.value ? { options: options.value } : {} })) sent()
}
</script>

<template>
  <section class="ai-thread" aria-label="AI thread">
    <AiThreadHeader :title="thread.title" @back="model.back()">
      <HstButton icon-only color="flat" type="button" :disabled="disabled" :aria-label="thread.status === 'resolved' ? 'Restore thread' : 'Archive thread'" :title="thread.status === 'resolved' ? 'Restore' : 'Archive'" @click="model.archive(thread.id, thread.status !== 'resolved')">
        <BuiltinIcon :icon="thread.status === 'resolved' ? 'renew' : 'checkmark'" :size="16" />
      </HstButton>
      <HstButton icon-only color="flat" type="button" :disabled="disabled || busy" aria-label="Delete thread" title="Delete" @click="model.remove(thread.id)">
        <BuiltinIcon icon="trash-can" :size="16" />
      </HstButton>
    </AiThreadHeader>
    <div ref="scroller" class="ai-thread-messages">
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
          :changes="message.changes"
          :failed="message.failed"
          :attachments="message.attachments"
        />
        <ThreadMessage v-if="busy" author="agent" :name="agent(thread.agentId).name" :icon="agent(thread.agentId).icon" :body="live?.text ?? ''" :steps="live?.steps" streaming aria-live="polite">
          <AgentLiveTail :steps="live?.steps ?? []" :text="live?.text ?? ''" :started-at="live?.startedAt" :queued="thread.status === 'sent'" />
        </ThreadMessage>
        <AiCreatedStories :changes="changes" @select="emit('select', $event)" />
      </div>
    </div>
    <form class="ai-thread-reply" @submit.prevent="submit">
      <AgentPrompt :key="thread.id" :capture="capture" :model-value="draft.body" :attachments="draft.attachments" :options="options ?? thread.options" compact label="Reply to thread" :placeholder="busy ? 'Agent is working…' : 'Reply…'" :agents="thread.agentId ? agents : usable" :agent-id="thread.agentId ?? agentId" :agent-locked="Boolean(thread.agentId)" :busy="busy" :disabled="disabled" @update:model-value="edit({ body: $event })" @update:attachments="edit({ attachments: $event })" @update:options="chooseOptions" @choose="choose" @send="submit" />
    </form>
  </section>
</template>

<style scoped>
.ai-thread { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.ai-thread-messages { flex: 1; min-height: 0; overflow: auto; padding: 16px var(--histoire-pane-gutter); }
.ai-thread-reply { padding: var(--histoire-pane-gutter); border-top: 1px solid var(--histoire-border); }
</style>
