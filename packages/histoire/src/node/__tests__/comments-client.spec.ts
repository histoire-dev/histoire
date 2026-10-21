import type { UiAgentActivity, UiAgentReply, UiCommentsSnapshot } from '@histoire/shared'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { useCommentDestination } from '../../../../histoire-app/src/app/components/comments/destination.js'
import { compactSelectorPath, filterComments, groupComments, propsSummary, selectorParts } from '../../../../histoire-app/src/app/components/comments/presentation.js'
import { createWorkbenchComments } from '../../../../histoire-app/src/app/stores/comments.js'
import { commentsSnapshotParts } from '../server/ui-channel/comments.js'
import { assertUiPayload } from '../server/ui-channel/validation.js'
import { commentDraft, commentFixture, commentStory } from './utils/comments.js'

/** Injectable transport drives the actual client model without browser globals. */
function transport() {
  let receive: (snapshot: UiCommentsSnapshot) => void = () => {}
  let disconnect: () => void = () => {}
  let reply: (value: UiAgentReply) => void = () => {}
  let activity: (value: UiAgentActivity) => void = () => {}
  const send = vi.fn(() => true)
  return { send, port: { available: true, send, subscribe(callback: typeof receive) {
    receive = callback
    return () => {}
  }, stream(callback: typeof reply) {
    reply = callback
    return () => {}
  }, activity(callback: typeof activity) {
    activity = callback
    return () => {}
  }, disconnect(callback: typeof disconnect) {
    disconnect = callback
    return () => {}
  } }, snapshot(value: Partial<UiCommentsSnapshot> = {}) {
    receive({ enabled: true, revision: 'current', part: 0, total: 1, comments: [], ...value })
  }, delta(value: UiAgentReply) {
    reply(value)
  }, step(value: UiAgentActivity) {
    activity(value)
  }, disconnected() {
    disconnect()
  } }
}

describe('workbench comments', () => {
  it('clears errors after five seconds and restarts lifetime for repeated failures', () => {
    vi.useFakeTimers()
    const channel = transport()
    const model = createWorkbenchComments(channel.port)
    try {
      channel.snapshot({ error: 'Server execution is unavailable' })
      vi.advanceTimersByTime(4999)
      expect(model.error.value).toBe('Server execution is unavailable')
      vi.advanceTimersByTime(1)
      expect(model.error.value).toBe('')
      model.error.value = 'Screenshot unavailable. Retry capture.'
      vi.advanceTimersByTime(3000)
      model.error.value = 'Screenshot unavailable. Retry capture.'
      vi.advanceTimersByTime(4999)
      expect(model.error.value).toBe('Screenshot unavailable. Retry capture.')
      vi.advanceTimersByTime(1)
      expect(model.error.value).toBe('')
      model.error.value = 'Screenshot service disconnected.'
      model.close()
      expect(vi.getTimerCount()).toBe(0)
    }
    finally {
      model.close()
      vi.useRealTimers()
    }
  })

  it('installs bounded snapshots atomically and retires disconnected/closed authority', () => {
    const channel = transport()
    const model = createWorkbenchComments(channel.port)
    const first = commentFixture()
    const second = commentFixture()
    expect(channel.send).toHaveBeenCalledWith('histoire:ui:ready', {})
    channel.snapshot({ total: 2, comments: [first] })
    expect(model.comments.value).toEqual([])
    channel.snapshot({ part: 1, total: 2, comments: [second] })
    expect(model.comments.value).toEqual([first, second])
    channel.disconnected()
    expect(model.resolve(first.id, true)).toBe(false)
    model.close()
    channel.snapshot({ comments: [] })
    expect(model.comments.value).toEqual([first, second])
  })

  it('keeps composer ownership through unrelated snapshots, stale values, and request-scoped failure', () => {
    const channel = transport()
    const model = createWorkbenchComments(channel.port)
    channel.snapshot()
    const draft = commentDraft('Spinner must keep label color')
    expect(model.sendDraft(draft, 'agent')).toBe(true)
    const firstRequest = channel.send.mock.calls.at(-1)![1] as { requestId: string }
    expect(channel.send).toHaveBeenLastCalledWith('histoire:ui:comment-send', expect.objectContaining({ ids: [draft.id], agentId: 'agent', draft, requestId: expect.any(String) }))
    expect(model.draft.value?.body).toBe(draft.body)
    expect(model.pending.value).toBe(true)
    channel.snapshot({ comments: [commentFixture()] })
    channel.snapshot({ comments: [commentFixture({ ...draft, body: 'Older text' })] })
    channel.snapshot({ error: 'Other client failed' })
    expect(model.pending.value).toBe(true)
    expect(model.draft.value?.body).toBe(draft.body)
    expect(model.sendDraft(draft, 'agent')).toBe(false)
    channel.snapshot({ error: 'Save failed', requestId: firstRequest.requestId })
    expect(model.draft.value?.body).toBe(draft.body)
    expect(model.pending.value).toBe(false)
    expect(model.save(draft)).toBe(true)
    expect((channel.send.mock.calls.at(-1)![1] as { requestId: string }).requestId).not.toBe(firstRequest.requestId)
    channel.snapshot({ comments: [commentFixture(draft)] })
    expect(model.draft.value).toBeNull()
    expect(model.selected.value?.id).toBe(draft.id)
    model.close()
  })

  it('keeps orphan threads and filters resolved annotations without deleting them', () => {
    const known = commentFixture()
    const resolved = commentFixture({ status: 'resolved' })
    const orphan = commentFixture({ variantId: 'removed' })
    const comments = [known, resolved, orphan]
    expect(filterComments(comments, 'open')).toEqual([known, orphan])
    expect(filterComments(comments, 'resolved')).toEqual([resolved])
    expect(groupComments(comments, [commentStory])).toMatchObject([{ orphaned: false, comments: [known, resolved] }, { orphaned: true, comments: [orphan] }])
    expect(comments).toHaveLength(3)
  })

  it('separates story render root from anchor selector path', () => {
    expect(selectorParts('[data-test-id="sandbox-render"] > div > span')).toEqual({ storyRoot: true, path: 'div > span' })
    expect(selectorParts('[data-test-id="sandbox-render"]')).toEqual({ storyRoot: true, path: '' })
    expect(selectorParts('#app > div')).toEqual({ storyRoot: false, path: '#app > div' })
    expect(compactSelectorPath('div > ul > li:nth-of-type(2) > span')).toBe('… > li:nth-of-type(2) > span')
    expect(compactSelectorPath('div > span')).toBe('div > span')
  })

  it('summarizes captured props with collapsed nested values', () => {
    expect(propsSummary({ label: 'Meow', size: 2, disabled: false, items: [1, 2], style: { a: 1 }, empty: null }))
      .toEqual(['label: "Meow"', 'size: 2', 'disabled: false', 'items: [2]', 'style: {…}', 'empty: null'])
    expect(propsSummary({ count: 1, componentProps: { 0: { size: 'lg' }, 2: { label: 'Hi' } } })).toEqual(['count: 1', 'size: "lg"', 'label: "Hi"'])
    expect(propsSummary({ componentProps: {} })).toEqual([])
  })

  it('splits large file snapshots within transport limit without losing comments', () => {
    const comments = Array.from({ length: 10 }, () => commentFixture({ body: 'x'.repeat(8192) }))
    const parts = commentsSnapshotParts(comments, true)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) expect(() => assertUiPayload(part)).not.toThrow()
    expect(parts.flatMap(part => part.comments)).toEqual(comments)
  })

  it('streams only exact working conversations and replaces deltas with final persisted reply', () => {
    const channel = transport()
    const model = createWorkbenchComments(channel.port)
    const comment = commentFixture({ status: 'working', agentId: 'active-agent' })
    channel.snapshot({ comments: [comment] })
    channel.delta({ agentId: 'other-agent', threadId: comment.id, text: 'Wrong agent' })
    channel.delta({ agentId: 'active-agent', threadId: 'other-thread', text: 'Wrong thread' })
    expect(model.streaming.value).toEqual({})
    channel.delta({ agentId: 'active-agent', threadId: comment.id, text: 'Fixing ' })
    channel.delta({ agentId: 'active-agent', threadId: comment.id, text: 'width' })
    expect(model.streaming.value[comment.id]?.text).toBe('Fixing width')
    channel.snapshot({ comments: [comment, commentFixture()] })
    expect(model.streaming.value[comment.id]?.text).toBe('Fixing width')
    channel.snapshot({ comments: [{ ...comment, status: 'replied', thread: [{ author: 'agent', agentId: 'active-agent', body: 'Fixed width', at: comment.updatedAt }] }] })
    channel.delta({ agentId: 'active-agent', threadId: comment.id, text: 'Late chunk' })
    expect(model.streaming.value).toEqual({})
    expect(model.comments.value[0].thread).toHaveLength(1)
    model.close()
  })

  it('upserts live steps of working threads only and drops them with the final reply', () => {
    const channel = transport()
    const model = createWorkbenchComments(channel.port)
    const comment = commentFixture({ status: 'working', agentId: 'agent' })
    channel.snapshot({ comments: [comment] })
    channel.step({ agentId: 'other', threadId: comment.id, step: { id: 'a', kind: 'read', title: 'Read', status: 'pending' } })
    expect(model.streaming.value).toEqual({})
    channel.step({ agentId: 'agent', threadId: comment.id, step: { id: 'a', kind: 'read', title: 'Read', status: 'pending' } })
    channel.step({ agentId: 'agent', threadId: comment.id, step: { id: 'b', kind: 'edit', title: 'Edit', status: 'in_progress' } })
    channel.step({ agentId: 'agent', threadId: comment.id, step: { id: 'a', kind: 'read', title: 'Read', status: 'completed' } })
    channel.delta({ agentId: 'agent', threadId: comment.id, text: 'Done' })
    expect(model.streaming.value[comment.id]).toMatchObject({ text: 'Done', steps: [{ id: 'a', status: 'completed' }, { id: 'b', status: 'in_progress' }] })
    channel.snapshot({ comments: [{ ...comment, status: 'replied' }] })
    expect(model.streaming.value).toEqual({})
    model.close()
  })

  it('toggles an open thread back to its pin and closes it once resolved', () => {
    const channel = transport()
    const model = createWorkbenchComments(channel.port)
    const comment = commentFixture({ status: 'replied' })
    channel.snapshot({ comments: [comment] })
    model.toggle(comment.id)
    expect(model.activeId.value).toBe(comment.id)
    model.toggle(comment.id)
    expect(model.activeId.value).toBeNull()
    model.open(comment.id)
    expect(model.resolve(comment.id, true)).toBe(true)
    expect(model.activeId.value).toBeNull()
    model.open(comment.id)
    model.resolve(comment.id, false)
    expect(model.activeId.value).toBe(comment.id)
    model.close()
  })

  it('follows configured default, requires explicit ask-each-time choice, and preserves manual picks', async () => {
    const agents = shallowRef([{ id: 'first', name: 'First', state: 'idle', default: false, askEachTime: false }, { id: 'preferred', name: 'Preferred', state: 'idle', default: true, askEachTime: false }])
    const scope = effectScope()
    const destination = scope.run(() => useCommentDestination(() => agents.value))!
    expect(destination.agentId.value).toBe('preferred')
    agents.value = agents.value.map(agent => ({ ...agent, askEachTime: true }))
    await nextTick()
    expect(destination.agentId.value).toBe('')
    destination.choose('first')
    agents.value = agents.value.map(agent => ({ ...agent, name: `${agent.name} updated` }))
    await nextTick()
    expect(destination.agentId.value).toBe('first')
    destination.reset()
    expect(destination.agentId.value).toBe('')
    agents.value = agents.value.map(agent => ({ ...agent, askEachTime: false, state: agent.default ? 'disabled' : 'idle' }))
    await nextTick()
    expect(destination.agentId.value).toBe('first')
    scope.stop()
  })
})
