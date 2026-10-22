import type { RequestPermissionRequest } from '@agentclientprotocol/sdk'
import type { UiAgentPermission } from '@histoire/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { createPermissionBroker } from '../acp/permissions.js'
import { disposeAgentManagers, fakeManager } from './utils/acp.js'
import { disposeConfigProjects } from './utils/config-codemod.js'

afterEach(async () => {
  await disposeAgentManagers()
  await disposeConfigProjects()
})

/** Claude Code's ExitPlanMode request shape. */
const planExit: RequestPermissionRequest = {
  sessionId: 'session',
  toolCall: { toolCallId: 'exit', title: 'Ready to code?', kind: 'switch_mode', content: [{ type: 'content', content: { type: 'text', text: '# Plan with hunter2' } }] },
  options: [
    { optionId: 'exit-plan-clear-auto', name: 'Yes, clear context', kind: 'allow_always' },
    { optionId: 'exit-plan-bypass', name: 'Yes, and bypass permissions', kind: 'allow_always' },
    { optionId: 'exit-plan-accept-edits', name: 'Yes, auto-accept edits', kind: 'allow_always' },
    { optionId: 'exit-plan-default', name: 'Yes, manually approve edits', kind: 'allow_once' },
    { optionId: 'reject', name: 'No, keep planning', kind: 'reject_once' },
  ],
}

/** Broker under a given policy, collecting emitted cards and resolutions. */
function broker() {
  const cards: UiAgentPermission[] = []
  const resolved: string[] = []
  const value = createPermissionBroker({ root: '/project', policy: () => ({ fileEdits: 'ask', terminal: 'ask' }), emit: card => cards.push(card), resolved: id => resolved.push(id), sanitize: text => text.replace('hunter2', '[redacted]'), threadOf: () => 'thread' })
  return { broker: value, cards, resolved }
}

describe('plan mode exit approval', () => {
  it('shows the redacted plan with safe choices and maps them to agent options', async () => {
    const { broker: permissions, cards } = broker()
    const approved = permissions.request('agent', planExit)
    await expect.poll(() => cards.length).toBe(1)
    expect(cards[0]).toMatchObject({ kind: 'plan', threadId: 'thread', plan: '# Plan with [redacted]', choices: [{ id: 'reject', label: 'Keep planning', intent: 'reject' }, { id: 'approve', label: 'Approve', intent: 'approve' }] })
    permissions.reply(cards[0].requestId, true, true, 'approve')
    expect((await approved).outcome).toEqual({ outcome: 'selected', optionId: 'exit-plan-default' })
    const kept = permissions.request('agent', planExit)
    await expect.poll(() => cards.length).toBe(2)
    permissions.reply(cards[1].requestId, false, false, 'reject')
    expect((await kept).outcome).toEqual({ outcome: 'selected', optionId: 'reject' })
    permissions.close()
  })

  it('never offers elevated exits that bypass Histoire approvals', async () => {
    const { broker: permissions, cards } = broker()
    const pending = permissions.request('agent', planExit)
    await expect.poll(() => cards.length).toBe(1)
    expect(cards[0].choices?.map(choice => choice.id)).toEqual(['reject', 'approve'])
    permissions.reply(cards[0].requestId, true, false, 'exit-plan-bypass')
    permissions.reply(cards[0].requestId, true, true)
    expect((await pending).outcome).toEqual({ outcome: 'selected', optionId: 'exit-plan-default' })
    permissions.close()
  })

  it('selects reject_once for explicit denials but cancels on turn end or agent abort', async () => {
    const { broker: permissions, cards, resolved } = broker()
    const edit: RequestPermissionRequest = { sessionId: 'session', toolCall: { toolCallId: 'edit', kind: 'edit' }, options: [{ optionId: 'once', name: 'Allow', kind: 'allow_once' }, { optionId: 'no', name: 'No', kind: 'reject_once' }] }
    const denied = permissions.request('agent', edit)
    await expect.poll(() => cards.length).toBe(1)
    permissions.reply(cards[0].requestId, false, false)
    expect((await denied).outcome).toEqual({ outcome: 'selected', optionId: 'no' })
    const settled = permissions.request('agent', planExit)
    await expect.poll(() => cards.length).toBe(2)
    permissions.settle('agent', 'session')
    expect((await settled).outcome.outcome).toBe('cancelled')
    const abort = new AbortController()
    const aborted = permissions.request('agent', planExit, abort.signal)
    await expect.poll(() => cards.length).toBe(3)
    abort.abort()
    expect((await aborted).outcome.outcome).toBe('cancelled')
    expect(resolved).toContain(cards[2].requestId)
    permissions.close()
  })

  it('round-trips the chosen option through a real ACP peer', async () => {
    const { manager } = await fakeManager('exit-plan')
    const cards: UiAgentPermission[] = []
    manager.onUpdate((event) => {
      if (event.type === 'permission') cards.push(event.value)
    })
    const prompt = manager.prompt({ threadId: 'one', text: 'Plan' })
    await expect.poll(() => cards.length).toBe(1)
    expect(cards[0]).toMatchObject({ kind: 'plan', threadId: 'one', plan: '# Plan\n\n1. Add prop' })
    manager.replyPermission(cards[0].requestId, true, false, 'approve')
    expect(await prompt).toMatchObject({ text: 'exit-plan-default', decisions: [{ plan: '# Plan\n\n1. Add prop', outcome: 'approved' }] })
  })

  it('ends the turn normally when the agent stops after keep planning', async () => {
    const { manager } = await fakeManager('exit-plan')
    const cards: UiAgentPermission[] = []
    manager.onUpdate((event) => {
      if (event.type === 'permission') cards.push(event.value)
    })
    const prompt = manager.prompt({ threadId: 'one', text: 'Plan' })
    await expect.poll(() => cards.length).toBe(1)
    manager.replyPermission(cards[0].requestId, false, false, 'reject')
    expect(await prompt).toMatchObject({ text: 'reject', decisions: [{ plan: '# Plan\n\n1. Add prop', outcome: 'kept-planning' }] })
  })
})
