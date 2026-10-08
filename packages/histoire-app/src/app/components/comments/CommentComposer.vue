<script setup lang="ts">
import type { UiCommentAgent, UiCommentDraft } from '@histoire/shared'
import { BuiltinIcon, getControlElement, HstButton, HstPulsatingDisc, HstSelect, HstTextarea } from '@histoire/controls/vue'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { createShortcutRegistry, useShortcutRegistry } from '../../util/shortcuts.js'

import CommentContext from './CommentContext.vue'
import { useCommentDestination } from './destination.js'

const props = defineProps<{
  /** Current exact-frame draft. */
  draft: UiCommentDraft
  /** Collected story and variant display label. */
  title: string
  /** Safe ACP preset display state. */
  agents: readonly UiCommentAgent[]
  /** Screenshot request currently belongs to this draft. */
  capturing?: boolean
}>()
const emit = defineEmits<{
  /** Persist editable context without invoking agent. */
  save: [draft: UiCommentDraft]
  /** Save and invoke chosen agent through one server request. */
  send: [draft: UiCommentDraft, agentId: string]
  /** Capture current exact frame through existing screenshot service. */
  attach: []
  /** Dismiss floating composer. */
  close: []
  /** Open AI agent settings. */
  setupAgent: []
}>()
const body = ref(props.draft.body)
const input = ref<HTMLTextAreaElement>()
const shortcuts = useShortcutRegistry() ?? createShortcutRegistry()
onUnmounted(shortcuts.bind('comment.screenshot', attach, { allowInput: true, enabled: () => !props.capturing }))
const { agentId, usable, choose, reset } = useCommentDestination(() => props.agents)
watch(() => props.draft.id, () => {
  body.value = props.draft.body
  reset()
})
onMounted(() => input.value?.focus())
/** Button and composer shortcut share the current capture gate. */
function attach() {
  if (!props.capturing) emit('attach')
}
/** Consume comment shortcuts only while focus stays inside this composer. */
function keydown(event: KeyboardEvent) {
  if (shortcuts.handle(event, ['comment'], true)) event.stopPropagation()
}
/** Composer dispatches current text together with immutable point context. */
function send() {
  if (body.value.trim() && agentId.value && !props.capturing) emit('send', { ...props.draft, body: body.value }, agentId.value)
}
</script>

<template>
  <form class="comment-card comment-composer" aria-label="Comment for AI" @submit.prevent="send" @keydown="keydown" @keydown.escape.stop.prevent="emit('close')">
    <div class="comment-composer-header">
      <CommentContext :title="title" :comment="draft" />
      <HstButton icon-only color="flat" type="button" class="icon-button close-button" aria-label="Close comment" title="Close comment (Esc)" @click="emit('close')">
        <BuiltinIcon icon="close" :size="16" />
      </HstButton>
    </div>
    <div class="comment-composer-body">
      <HstTextarea :ref="value => { input = getControlElement(value) as HTMLTextAreaElement }" v-model="body" layout="inline" maxlength="8192" aria-label="Comment message" placeholder="Describe what to change…" @keydown.meta.enter.prevent="send" @keydown.ctrl.enter.prevent="send" />
    </div>
    <footer>
      <HstButton icon-only color="flat" type="button" class="icon-button" :disabled="capturing" :aria-label="capturing ? 'Capturing screenshot' : 'Attach screenshot'" :title="capturing ? 'Capturing screenshot' : `Attach screenshot (${shortcuts.hint('comment.screenshot')})`" aria-keyshortcuts="Control+Shift+S Meta+Shift+S" @click="attach">
        <HstPulsatingDisc v-if="capturing" />
        <BuiltinIcon v-else icon="camera" :size="16" />
      </HstButton>
      <HstButton color="flat" type="button" class="save-draft" :disabled="!body.trim() || capturing" @click="emit('save', { ...draft, body })">
        Save draft
      </HstButton>
      <template v-if="usable.length">
        <label class="agent-picker"><BuiltinIcon icon="bot" :size="16" /><HstSelect layout="inline" :model-value="agentId" aria-label="Comment agent" placeholder="Choose agent" :options="usable.map(agent => ({ value: agent.id, label: agent.name }))" @update:model-value="choose" /></label>
        <HstButton color="primary" type="submit" class="send-button" :disabled="!body.trim() || !agentId || capturing">
          <BuiltinIcon icon="send-alt-filled" :size="16" />Send
        </HstButton>
      </template>
      <HstButton v-else color="primary" type="button" class="send-button" @click="emit('setupAgent')">
        <BuiltinIcon icon="bot" :size="16" />Set up an agent
      </HstButton>
    </footer>
  </form>
</template>

<style scoped>
.comment-card { width: 360px; max-width: calc(100vw - 24px); background: var(--histoire-surface); color: var(--histoire-text); border-radius: var(--histoire-radius-panel); box-shadow: var(--histoire-shadow-panel); overflow: hidden; }
.comment-composer-header { display: flex; align-items: flex-start; border-bottom: 1px solid var(--histoire-border); }
.comment-composer-header :deep(.comment-context) { flex: 1; min-width: 0; border-bottom: 0; }
.close-button { flex: none; margin: 12px 12px 0 0; }
.comment-composer-body { padding: 12px; }
.histoire-textarea { display: flex; width: 100%; }
.histoire-textarea :deep(textarea) { min-height: 130px; }
.comment-composer { --histoire-control-accent: var(--histoire-agent); --histoire-control-on-accent: #fff; }
footer { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--histoire-border); }
button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; }
.icon-button { color: var(--histoire-muted); }
.save-draft { margin-right: auto; color: var(--histoire-muted); }
.agent-picker { display: flex; align-items: center; gap: 6px;  }
.agent-picker svg { color: var(--histoire-agent); }
.histoire-select { max-width: 150px; }
.send-button { --histoire-control-accent: var(--histoire-agent); padding: 8px 10px; font-weight: 700; }
</style>
