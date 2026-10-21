import type { SessionNotification } from '@agentclientprotocol/sdk'
import type { UiAgentStep } from '@histoire/shared'
import { countChangedLines, projectRelativePath } from './file-changes.js'

/** Steps kept per reply; later tool calls are dropped. */
const STEP_LIMIT = 200
/** Visible title length kept per step. */
const TITLE_LIMIT = 300
/** ACP tool kinds rendered by the UI; `switch_mode` and unknown kinds become `other`. */
const KINDS = new Set<UiAgentStep['kind']>(['read', 'edit', 'delete', 'move', 'search', 'execute', 'think', 'fetch', 'other'])
/** ACP tool call statuses. */
const STATUSES = new Set<UiAgentStep['status']>(['pending', 'in_progress', 'completed', 'failed'])

/**
 * Projects one prompt's ACP tool calls and thinking spans into bounded, redacted UI steps.
 * Arguments, raw output and thought text are never retained.
 * @param root Project root used to relativize reported locations.
 * @param sanitize Redacts known secrets from titles and paths.
 */
export function createAgentActivity(root: string, sanitize: (text: string) => string) {
  const steps = new Map<string, UiAgentStep>()
  /** Line counts per tool and file; repeated diff updates replace, never add. */
  const diffs = new Map<string, Map<string, { added: number, removed: number }>>()
  /** Currently open thinking span, closed by any other update. */
  let thinking: UiAgentStep | undefined
  let thoughts = 0

  /** Ends the open thinking span, returning it when it changed. */
  function closeThinking(): UiAgentStep[] {
    if (!thinking) return []
    thinking.status = 'completed'
    const closed = { ...thinking }
    thinking = undefined
    return [closed]
  }

  return {
    /**
     * Applies one validated session notification.
     * @returns Copies of every step whose state changed, in order.
     */
    update(notification: SessionNotification): UiAgentStep[] {
      const update = notification.update
      if (update.sessionUpdate === 'agent_thought_chunk') {
        if (thinking || steps.size >= STEP_LIMIT) return []
        thinking = { id: `think-${thoughts++}`, kind: 'think', title: 'Thinking', status: 'in_progress' }
        steps.set(thinking.id, thinking)
        return [{ ...thinking }]
      }
      if (update.sessionUpdate !== 'tool_call' && update.sessionUpdate !== 'tool_call_update') {
        return update.sessionUpdate === 'agent_message_chunk' ? closeThinking() : []
      }
      const changed = closeThinking()
      const previous = steps.get(update.toolCallId)
      if (!previous && steps.size >= STEP_LIMIT) return changed
      const step: UiAgentStep = previous ?? { id: update.toolCallId.slice(0, 200), kind: 'other', title: 'Tool call', status: 'pending' }
      if (typeof update.title === 'string' && update.title.trim()) step.title = sanitize(update.title).slice(0, TITLE_LIMIT)
      if (update.kind) step.kind = KINDS.has(update.kind as UiAgentStep['kind']) ? update.kind as UiAgentStep['kind'] : 'other'
      if (update.status && STATUSES.has(update.status)) step.status = update.status
      const location = update.locations?.map(item => projectRelativePath(root, item.path)).find(Boolean)
      if (location) step.target = sanitize(location)
      const files = diffs.get(update.toolCallId) ?? new Map()
      for (const content of update.content ?? []) {
        if (content.type !== 'diff' || content.newText.length > 1_000_000 || (content.oldText?.length ?? 0) > 1_000_000) continue
        const file = projectRelativePath(root, content.path)
        if (!file || (!files.has(file) && files.size >= 64)) continue
        files.set(file, countChangedLines(content.oldText ?? '', content.newText))
        step.target ??= sanitize(file)
      }
      if (files.size) {
        diffs.set(update.toolCallId, files)
        step.added = [...files.values()].reduce((sum, count) => sum + count.added, 0)
        step.removed = [...files.values()].reduce((sum, count) => sum + count.removed, 0)
      }
      steps.set(update.toolCallId, step)
      return [...changed, { ...step }]
    },
    /** Current steps in arrival order. */
    snapshot(): UiAgentStep[] {
      return [...steps.values()].map(step => ({ ...step }))
    },
    /** Settles still-running steps once the prompt ended, returning final steps. */
    finish(): UiAgentStep[] {
      closeThinking()
      for (const step of steps.values()) {
        if (step.status === 'pending' || step.status === 'in_progress') step.status = 'completed'
      }
      return [...steps.values()].map(step => ({ ...step }))
    },
  }
}
