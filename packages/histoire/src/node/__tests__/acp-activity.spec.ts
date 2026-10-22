import type { SessionNotification } from '@agentclientprotocol/sdk'
import { describe, expect, it } from 'vitest'
import { createAgentActivity } from '../acp/activity.js'

/** Wraps a session update the way ACP delivers it. */
function note(update: Record<string, unknown>): SessionNotification {
  return { sessionId: 'session', update } as unknown as SessionNotification
}

describe('agent activity projection', () => {
  it('folds tool call updates into ordered steps with relative targets and diff counts', () => {
    const activity = createAgentActivity('/project', text => text.replace('hunter2', '[redacted]'))
    expect(activity.update(note({ sessionUpdate: 'tool_call', toolCallId: 'a', title: 'Read Meow.story.vue', kind: 'read', status: 'pending', locations: [{ path: '/project/src/Meow.story.vue' }] }))).toMatchObject([{ id: 'a', kind: 'read', status: 'pending', target: 'src/Meow.story.vue' }])
    activity.update(note({ sessionUpdate: 'tool_call_update', toolCallId: 'a', status: 'completed' }))
    activity.update(note({ sessionUpdate: 'tool_call', toolCallId: 'b', title: 'Run curl -H hunter2', kind: 'execute', status: 'in_progress' }))
    activity.update(note({ sessionUpdate: 'tool_call_update', toolCallId: 'b', status: 'failed' }))
    activity.update(note({ sessionUpdate: 'tool_call', toolCallId: 'c', title: 'Edit', kind: 'edit', status: 'completed', content: [{ type: 'diff', path: '/project/a.ts', oldText: 'x\n', newText: 'x\ny\n' }] }))
    expect(activity.snapshot()).toEqual([
      { id: 'a', kind: 'read', title: 'Read Meow.story.vue', status: 'completed', target: 'src/Meow.story.vue' },
      { id: 'b', kind: 'execute', title: 'Run curl -H [redacted]', status: 'failed' },
      { id: 'c', kind: 'edit', title: 'Edit', status: 'completed', target: 'a.ts', added: 1, removed: 0 },
    ])
  })

  it('merges contiguous thoughts into one thinking step and drops paths outside root', () => {
    const activity = createAgentActivity('/project', text => text)
    activity.update(note({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Hmm' } }))
    activity.update(note({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: ' more' } }))
    expect(activity.snapshot()).toEqual([{ id: 'think-0', kind: 'think', title: 'Thinking', status: 'in_progress' }])
    // The closed thinking span is reported alongside the new tool call.
    expect(activity.update(note({ sessionUpdate: 'tool_call', toolCallId: 'x', title: 'Read', kind: 'unknown-kind', locations: [{ path: '/etc/passwd' }] }))).toMatchObject([{ id: 'think-0', status: 'completed' }, { kind: 'other', status: 'pending' }])
    activity.update(note({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Again' } }))
    expect(activity.snapshot().map(step => [step.id, step.status, step.target])).toEqual([['think-0', 'completed', undefined], ['x', 'pending', undefined], ['think-1', 'in_progress', undefined]])
    // Finishing settles the open thinking span so persisted replies never look live.
    expect(activity.finish().at(-1)?.status).toBe('completed')
  })

  it('bounds step count and title length', () => {
    const activity = createAgentActivity('/project', text => text)
    for (let index = 0; index < 250; index++) activity.update(note({ sessionUpdate: 'tool_call', toolCallId: `t${index}`, title: 'x'.repeat(500), kind: 'read' }))
    expect(activity.snapshot()).toHaveLength(200)
    expect(activity.snapshot()[0].title).toHaveLength(300)
  })

  it('leaves plan mode exits to the plan decision instead of listing a failed step', () => {
    const activity = createAgentActivity('/project', text => text)
    expect(activity.update(note({ sessionUpdate: 'tool_call', toolCallId: 'exit', title: 'Ready to code?', kind: 'switch_mode', status: 'pending' }))).toEqual([])
    expect(activity.update(note({ sessionUpdate: 'tool_call_update', toolCallId: 'exit', status: 'failed' }))).toEqual([])
    expect(activity.finish()).toEqual([])
  })
})
