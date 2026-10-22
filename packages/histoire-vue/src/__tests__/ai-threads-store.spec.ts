import type { UiAgentActivity, UiAgentPlan, UiAgentReply } from '@histoire/shared'
import type { AiThreadsSnapshotPart } from '../../../histoire-app/src/app/stores/ai-threads.js'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import { useCommentDestination } from '../../../histoire-app/src/app/components/comments/destination.js'
import { createAiThreads } from '../../../histoire-app/src/app/stores/ai-threads.js'
import { commentDraft, commentFixture } from '../../../histoire/src/node/__tests__/utils/comments.js'

/** Scripted transport drives the actual store without browser globals. */
function transport() {
  let receive: (snapshot: AiThreadsSnapshotPart) => void = () => {}
  let disconnect: () => void = () => {}
  let reply: (value: UiAgentReply) => void = () => {}
  let activity: (value: UiAgentActivity) => void = () => {}
  let plan: (value: UiAgentPlan) => void = () => {}
  const send = vi.fn(() => true)
  const port = {
    available: true,
    send,
    /** Capture the snapshot listener. */
    subscribe(callback: typeof receive) {
      receive = callback
      return () => {}
    },
    /** Capture the reply delta listener. */
    stream(callback: typeof reply) {
      reply = callback
      return () => {}
    },
    /** Capture the step listener. */
    activity(callback: typeof activity) {
      activity = callback
      return () => {}
    },
    /** Capture the plan listener. */
    plan(callback: typeof plan) {
      plan = callback
      return () => {}
    },
    /** Capture the disconnect listener. */
    disconnect(callback: typeof disconnect) {
      disconnect = callback
      return () => {}
    },
  }
  return { send, port,
    /** Publish one snapshot part (complete single part by default). */
    snapshot(value: Partial<AiThreadsSnapshotPart> = {}) {
      receive({ enabled: true, pinsEnabled: true, revision: 'current', part: 0, total: 1, items: [], ...value })
    },
    /** Deliver one streamed reply chunk. */
    delta(value: UiAgentReply) {
      reply(value)
    },
    /** Deliver one streamed step. */
    step(value: UiAgentActivity) {
      activity(value)
    },
    /** Deliver one streamed plan. */
    planned(value: UiAgentPlan) {
      plan(value)
    },
    /** Simulate channel loss. */
    disconnected() {
      disconnect()
    } }
}

/** Store connected to a fresh scripted transport with one empty snapshot installed. */
function setup() {
  const channel = transport()
  const model = createAiThreads(channel.port)
  channel.snapshot()
  return { channel, model }
}

/** Request id of the last sent message. */
function lastRequestId(send: ReturnType<typeof vi.fn>): string {
  return (send.mock.calls.at(-1)![1] as { requestId: string }).requestId
}

/** Frame point context of a pinned draft. */
const point = { target: { storyId: 'button:one', variantId: 'loading:small' }, anchor: { x: 10, y: 20 } }

describe('aI threads snapshots', () => {
  it('clears errors after five seconds and restarts lifetime for repeated failures', () => {
    vi.useFakeTimers()
    const channel = transport()
    const model = createAiThreads(channel.port)
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
    const model = createAiThreads(channel.port)
    const first = commentFixture()
    const second = commentFixture()
    expect(channel.send).toHaveBeenCalledWith('histoire:ui:ready', {})
    channel.snapshot({ total: 2, items: [first] })
    expect(model.threads.value).toEqual([])
    channel.snapshot({ part: 1, total: 2, items: [second] })
    expect(model.threads.value).toEqual([first, second])
    channel.disconnected()
    expect(model.archive(first.id, true)).toBe(false)
    model.close()
    channel.snapshot({ items: [] })
    expect(model.threads.value).toEqual([first, second])
  })

  it('streams only exact working threads and replaces deltas with the final persisted reply', () => {
    const { channel, model } = setup()
    const thread = commentFixture({ status: 'working', agentId: 'active-agent' })
    channel.snapshot({ items: [thread] })
    channel.delta({ agentId: 'other-agent', threadId: thread.id, text: 'Wrong agent' })
    channel.delta({ agentId: 'active-agent', threadId: 'other-thread', text: 'Wrong thread' })
    expect(model.streaming.value).toEqual({})
    channel.delta({ agentId: 'active-agent', threadId: thread.id, text: 'Fixing ' })
    channel.delta({ agentId: 'active-agent', threadId: thread.id, text: 'width' })
    expect(model.streaming.value[thread.id]?.text).toBe('Fixing width')
    channel.snapshot({ items: [thread, commentFixture()] })
    expect(model.streaming.value[thread.id]?.text).toBe('Fixing width')
    channel.snapshot({ items: [{ ...thread, status: 'replied', thread: [{ author: 'agent', agentId: 'active-agent', body: 'Fixed width', at: thread.updatedAt }] }] })
    channel.delta({ agentId: 'active-agent', threadId: thread.id, text: 'Late chunk' })
    expect(model.streaming.value).toEqual({})
    expect(model.threads.value[0].thread).toHaveLength(1)
    model.close()
  })

  it('upserts live steps of working threads only and drops them with the final reply', () => {
    const { channel, model } = setup()
    const thread = commentFixture({ status: 'working', agentId: 'agent' })
    channel.snapshot({ items: [thread] })
    channel.step({ agentId: 'other', threadId: thread.id, step: { id: 'a', kind: 'read', title: 'Read', status: 'pending' } })
    expect(model.streaming.value).toEqual({})
    channel.step({ agentId: 'agent', threadId: thread.id, step: { id: 'a', kind: 'read', title: 'Read', status: 'pending' } })
    channel.step({ agentId: 'agent', threadId: thread.id, step: { id: 'b', kind: 'edit', title: 'Edit', status: 'in_progress' } })
    channel.step({ agentId: 'agent', threadId: thread.id, step: { id: 'a', kind: 'read', title: 'Read', status: 'completed' } })
    channel.delta({ agentId: 'agent', threadId: thread.id, text: 'Done' })
    expect(model.streaming.value[thread.id]).toMatchObject({ text: 'Done', steps: [{ id: 'a', status: 'completed' }, { id: 'b', status: 'in_progress' }] })
    channel.snapshot({ items: [{ ...thread, status: 'replied' }] })
    expect(model.streaming.value).toEqual({})
    model.close()
  })

  it('replaces the live plan of working threads only', () => {
    const { channel, model } = setup()
    const thread = commentFixture({ status: 'working', agentId: 'agent' })
    channel.snapshot({ items: [thread] })
    channel.planned({ agentId: 'other', threadId: thread.id, entries: [{ content: 'Nope', status: 'pending' }] })
    expect(model.streaming.value).toEqual({})
    channel.planned({ agentId: 'agent', threadId: thread.id, entries: [{ content: 'Read', status: 'in_progress' }, { content: 'Edit', status: 'pending' }] })
    channel.planned({ agentId: 'agent', threadId: thread.id, entries: [{ content: 'Read', status: 'completed' }] })
    expect(model.streaming.value[thread.id]?.plan).toEqual([{ content: 'Read', status: 'completed' }])
    model.close()
  })

  it('counts working threads and open pinned threads once each for the rail badge', () => {
    const { channel, model } = setup()
    channel.snapshot({ items: [
      commentFixture({ status: 'working', agentId: 'agent' }),
      commentFixture({ status: 'replied' }),
      commentFixture({ status: 'resolved' }),
      { ...commentFixture({ status: 'working', agentId: 'agent' }), anchor: undefined },
      { ...commentFixture({ status: 'replied' }), anchor: undefined },
    ] })
    expect(model.attention.value).toBe(3)
    model.close()
  })
})

describe('aI threads navigation', () => {
  it('lists either active threads or only archived ones', () => {
    const { channel, model } = setup()
    const open = commentFixture({ status: 'replied', updatedAt: '2026-10-03T11:00:00.000Z' })
    const archived = commentFixture({ status: 'resolved' })
    channel.snapshot({ items: [open, archived] })
    expect(model.visible.value.map(thread => thread.id)).toEqual([open.id])
    model.showArchived.value = true
    expect(model.visible.value.map(thread => thread.id)).toEqual([archived.id])
  })

  it('opens the new thread view and lands on the created thread', () => {
    const { channel, model } = setup()
    model.compose()
    expect(model.composing.value).toBe(true)
    model.back()
    expect(model.composing.value).toBe(false)
    model.compose()
    const id = crypto.randomUUID()
    expect(model.create({ id, body: 'Create a story' }, 'claude')).toBe(true)
    channel.snapshot({ items: [commentFixture({ id, body: 'Create a story', anchor: undefined })] })
    expect(model.selectedThread.value?.id).toBe(id)
    expect(model.composing.value).toBe(false)
  })

  it('toggles an open pin card and closes it once archived', () => {
    const { channel, model } = setup()
    const thread = commentFixture({ status: 'replied' })
    channel.snapshot({ items: [thread] })
    model.toggle(thread.id)
    expect(model.activeId.value).toBe(thread.id)
    model.toggle(thread.id)
    expect(model.activeId.value).toBeNull()
    model.open(thread.id)
    expect(model.archive(thread.id, true)).toBe(true)
    expect(model.activeId.value).toBeNull()
    model.open(thread.id)
    model.archive(thread.id, false)
    expect(model.activeId.value).toBe(thread.id)
    model.close()
  })

  it('dismisses the canvas card but keeps a free-form thread open in the pane', () => {
    const { channel, model } = setup()
    const pinned = commentFixture()
    const free = { ...commentFixture(), anchor: undefined }
    channel.snapshot({ items: [pinned, free] })
    model.open(pinned.id)
    model.dismiss()
    expect(model.activeId.value).toBeNull()
    model.open(free.id)
    model.dismiss()
    expect(model.activeId.value).toBe(free.id)
    model.close()
  })
})

describe('aI threads canvas drafts', () => {
  it('composes pinned drafts only while pins are enabled', () => {
    const { channel, model } = setup()
    expect(model.composePin(point)).toBe(true)
    expect(model.draft.value).toMatchObject({ body: '', context: point.target, anchor: point.anchor })
    model.dismiss()
    channel.snapshot({ pinsEnabled: false })
    expect(model.pinsAvailable.value).toBe(false)
    expect(model.composePin(point)).toBe(false)
    expect(model.draft.value).toBeNull()
    model.close()
  })

  it('keeps composer ownership through unrelated snapshots and request-scoped failure', () => {
    const { channel, model } = setup()
    const draft = commentDraft('Spinner must keep label color')
    expect(model.sendDraft(draft, 'agent')).toBe(true)
    const firstRequest = lastRequestId(channel.send)
    expect(channel.send).toHaveBeenLastCalledWith('histoire:ui:ai-thread-create', { draft, agentId: 'agent', requestId: firstRequest })
    expect(model.draft.value?.body).toBe(draft.body)
    expect(model.pending.value).toBe(true)
    channel.snapshot({ items: [commentFixture()] })
    channel.snapshot({ error: 'Other client failed', requestId: 'other' })
    expect(model.pending.value).toBe(true)
    expect(model.sendDraft(draft, 'agent')).toBe(false)
    channel.snapshot({ error: 'Save failed', requestId: firstRequest })
    expect(model.draft.value?.body).toBe(draft.body)
    expect(model.pending.value).toBe(false)
    expect(model.sendDraft(draft, 'agent', { model: 'large' })).toBe(true)
    expect(channel.send).toHaveBeenLastCalledWith('histoire:ui:ai-thread-create', expect.objectContaining({ options: { model: 'large' } }))
    expect(lastRequestId(channel.send)).not.toBe(firstRequest)
    channel.snapshot({ items: [commentFixture({ ...draft })] })
    expect(model.draft.value).toBeNull()
    expect(model.pending.value).toBe(false)
    expect(model.selectedThread.value?.id).toBe(draft.id)
    model.close()
  })

  it('saves a draft without sending and opens the stored thread', () => {
    const { channel, model } = setup()
    const draft = commentDraft('Later')
    expect(model.save(draft)).toBe(true)
    expect(channel.send).toHaveBeenLastCalledWith('histoire:ui:ai-thread-save', { draft, requestId: expect.any(String) })
    channel.snapshot({ items: [commentFixture({ ...draft })] })
    expect(model.draft.value).toBeNull()
    expect(model.activeId.value).toBe(draft.id)
    model.close()
  })

  it('releases a pending request on disconnect', () => {
    const { channel, model } = setup()
    model.sendDraft(commentDraft(), 'agent')
    channel.disconnected()
    expect(model.pending.value).toBe(false)
    model.close()
  })
})

describe('agent destination', () => {
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
