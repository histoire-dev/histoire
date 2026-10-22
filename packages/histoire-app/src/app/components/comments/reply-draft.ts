import type { UiCommentAttachment, UiCommentSessionOptions } from '@histoire/shared'
import { computed, ref } from 'vue'

/** Unsent reply state of one conversation. */
interface ReplyDraft {
  /** Message text. */
  body: string
  /** Uploaded files. */
  attachments: UiCommentAttachment[]
  /** Session choices; absent until changed. */
  options?: UiCommentSessionOptions
  /** Agent the session choices were made for; they apply to no other agent. */
  optionsAgentId?: string
}

/**
 * Reply drafts kept per conversation id, so switching threads keeps each one's unsent text and files.
 * @param id Current conversation id.
 * @param target Agent receiving the next reply.
 */
export function useReplyDrafts(id: () => string, target: () => string | undefined) {
  const drafts = ref<Record<string, ReplyDraft>>({})
  const draft = computed<ReplyDraft>(() => drafts.value[id()] ?? { body: '', attachments: [] })
  /** Update fields of the current draft. */
  function edit(patch: Partial<ReplyDraft>): void {
    drafts.value = { ...drafts.value, [id()]: { ...draft.value, ...patch } }
  }
  return {
    draft,
    edit,
    /** Draft choices only while they still target the current agent; a switch or reset drops them. */
    options: computed(() => draft.value.optionsAgentId === target() ? draft.value.options : undefined),
    /** Record choices for the current agent. */
    choose(options: UiCommentSessionOptions): void {
      edit({ options, optionsAgentId: target() })
    },
    /** Clear text and files after a send; session choices persist. */
    sent(): void {
      edit({ body: '', attachments: [] })
    },
  }
}
