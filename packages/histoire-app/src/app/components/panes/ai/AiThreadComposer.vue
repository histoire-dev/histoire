<script setup lang="ts">
import type { UiCommentAgent, UiCommentAttachment, UiCommentSessionOptions } from '@histoire/shared'
import type { AiThreads } from '../../../stores/ai-threads.js'
import { useHistoireSnapshot } from '@histoire/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useCommentDestination } from '../../comments/destination.js'
import AgentPrompt from '../../comments/prompt/AgentPrompt.vue'
import ContextChip from '../../comments/prompt/ContextChip.vue'
import AiThreadHeader from './AiThreadHeader.vue'

const props = defineProps<{
  /** Shared AI threads state. */
  model: AiThreads
  /** Current safe agent display states. */
  agents: readonly UiCommentAgent[]
  /** Selected-variant screenshot capture, attached to the message. */
  capture?: () => Promise<string>
}>()
const emit = defineEmits<{
  /** Open AI agent settings. */
  setupAgent: []
}>()
const body = ref('')
const prompt = ref<InstanceType<typeof AgentPrompt>>()
// The view opens on purpose to write a message.
onMounted(() => prompt.value?.focus())
const attachments = ref<UiCommentAttachment[]>([])
const options = ref<UiCommentSessionOptions>({})
const { agentId, usable, choose, reset } = useCommentDestination(() => props.agents)
const snapshot = useHistoireSnapshot()
/** Selected story offered as context until the user removes it. */
const story = computed(() => {
  const selection = snapshot.value.selection
  const value = selection && snapshot.value.catalog.stories.find(story => story.id === selection.storyId)
  if (!value || !selection) return undefined
  const variant = value.variants.find(variant => variant.id === selection.variantId)
  return { storyId: value.id, variantId: variant?.id, label: variant ? `${value.title} › ${variant.title}` : value.title }
})
const storyRemoved = ref(false)
// A new selection is offered again.
watch(() => `${story.value?.storyId}:${story.value?.variantId}`, () => storyRemoved.value = false)
const context = computed(() => storyRemoved.value ? undefined : story.value)

/** Create the thread; fields clear only when the channel accepted the request. */
function send() {
  if (!body.value.trim() || !agentId.value) return
  const draft = {
    id: crypto.randomUUID(),
    body: body.value,
    ...(attachments.value.length ? { attachments: attachments.value } : {}),
    ...(context.value ? { context: { storyId: context.value.storyId, ...(context.value.variantId ? { variantId: context.value.variantId } : {}) } } : {}),
  }
  if (!props.model.create(draft, agentId.value, options.value)) return
  body.value = ''
  attachments.value = []
  reset()
}
</script>

<template>
  <section class="ai-thread-new" aria-label="New AI thread">
    <AiThreadHeader title="New thread" @back="model.back()" />
    <form class="ai-thread-composer" @submit.prevent="send">
      <AgentPrompt ref="prompt" v-model="body" v-model:attachments="attachments" v-model:options="options" :capture="capture" label="New AI thread" placeholder="Ask the agent to create or change stories…" :agents="usable" :agent-id="agentId" :pending="model.pending.value" :disabled="!model.available.value" @choose="choose" @send="send" @setup-agent="emit('setupAgent')">
        <template v-if="context" #chips>
          <ContextChip :label="context.label" title="Story sent as context" removable @remove="storyRemoved = true" />
        </template>
      </AgentPrompt>
    </form>
  </section>
</template>

<style scoped>
.ai-thread-new { display: flex; flex: 1; flex-direction: column; min-height: 0; }
.ai-thread-composer { padding: var(--histoire-pane-gutter); }
</style>
