import type { UiVisualReply, UiVisualResult } from '@histoire/shared'
import type { Ref } from 'vue'
import type { createVisualCollection } from './visual-collection.js'
import type { createVisualTransport } from './visual-transport.js'
import { VISUAL_APPROVAL_BATCH_LIMIT } from '@histoire/shared'
import { ref, shallowRef } from 'vue'

/** Approval feedback binds receipts to exact admitted evidence, independent of visible selectors. */
export function createVisualApproval(transport: ReturnType<typeof createVisualTransport>, collection: ReturnType<typeof createVisualCollection>, state: () => { active: boolean, generation: number }, selectedIds: Ref<string[]>, issue: Ref<string>) {
  const approving = ref(false)
  const pending = shallowRef(new Set<string>())
  /** Generation retirement removes pending controls without granting any approval. */
  function reset(): void {
    approving.value = false
    pending.value = new Set()
  }
  return {
    approving,
    reset,
    /** Review handle identifies this capture and comparison source, not reused result ID. */
    pending: (result: UiVisualResult) => !!result.reviewHandle && pending.value.has(result.reviewHandle),
    /** Immediate pending state; individual durable receipts update rows before batch finishes. */
    async approve(ids: string[]): Promise<void> {
      const token = state().generation
      const requested = new Set(ids)
      const targets = collection.results.value.filter(result => requested.has(result.id) && !result.approved && !result.staleReason && !collection.busy(result) && result.reviewHandle)
      if (approving.value || !targets.length) return
      approving.value = true
      pending.value = new Set(targets.map(result => result.reviewHandle!))
      issue.value = ''
      const errors: string[] = []
      /** Late replies from retired owners cannot change current collection or selection. */
      const current = () => state().active && state().generation === token
      try {
        for (let index = 0; index < targets.length; index += VISUAL_APPROVAL_BATCH_LIMIT) {
          const batch = new Map(targets.slice(index, index + VISUAL_APPROVAL_BATCH_LIMIT).map(result => [result.id, result]))
          const seen = new Set<string>()
          /** Accept only receipts for exact submitted targets; duplicate final replies are harmless. */
          function apply(reply: UiVisualReply): void {
            if (!current()) return
            // One reactive update per streamed chunk instead of per receipt.
            const settled = new Set<string>()
            const approved: UiVisualResult[] = []
            for (const receipt of reply.receipts ?? []) {
              const target = batch.get(receipt.resultId)
              if (!target || seen.has(receipt.resultId)) continue
              seen.add(receipt.resultId)
              settled.add(target.reviewHandle!)
              if (receipt.status === 'approved') approved.push(target)
              else errors.push(receipt.error ?? 'Approval failed')
            }
            if (settled.size) pending.value = new Set([...pending.value].filter(handle => !settled.has(handle)))
            if (approved.length) {
              const visible = new Set(collection.results.value.map(result => result.reviewHandle))
              const deselected = new Set(approved.filter(target => visible.has(target.reviewHandle)).map(target => target.id))
              if (deselected.size) selectedIds.value = selectedIds.value.filter(id => !deselected.has(id))
              collection.approved(approved)
            }
            issue.value = errors.join('\n')
          }
          const selections = [...batch.values()].map(result => ({ handle: result.reviewHandle!, resultId: result.id }))
          const reply = await transport.request({ action: 'approve-review', selections }, apply)
          if (!current()) return
          apply(reply)
          if (seen.size !== batch.size) errors.push('Visual approval incomplete; retry remaining results')
        }
        if (current()) issue.value = errors.join('\n')
      }
      catch (error) { if (current()) issue.value = [...errors, (error as Error).message].join('\n') }
      finally { if (current()) reset() }
    },
  }
}
