import type { CreateElicitationRequest } from '@agentclientprotocol/sdk'
import type { UiAgentElicitation, UiAgentElicitationResolved } from '@histoire/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { projectElicitation } from '../acp/elicitation-schema.js'
import { createElicitationBroker } from '../acp/elicitations.js'
import { disposeAgentManagers, fakeManager } from './utils/acp.js'
import { disposeConfigProjects } from './utils/config-codemod.js'

afterEach(async () => {
  await disposeAgentManagers()
  await disposeConfigProjects()
})

/** Claude Code's AskUserQuestion form, one single-select question with its custom answer. */
const askUserQuestion = {
  sessionId: 'session',
  mode: 'form',
  message: 'Which color?',
  requestedSchema: { type: 'object', properties: {
    question_0: { type: 'string', title: 'Color', oneOf: [{ const: 'red', title: 'Red', description: 'Warm' }, { const: 'blue', title: 'Blue' }] },
    question_0_custom: { type: 'string', title: 'Other', description: 'Type your own answer' },
  } },
} as CreateElicitationRequest

/** Broker collecting emitted cards and resolutions. */
function broker(timeoutMs?: number) {
  const cards: UiAgentElicitation[] = []
  const resolved: UiAgentElicitationResolved[] = []
  const value = createElicitationBroker({ sanitize: text => text.replace('hunter2', '[redacted]'), emit: card => cards.push(card), resolved: item => resolved.push(item), threadOf: (_, sessionId) => sessionId === 'session' ? 'thread' : undefined, timeoutMs })
  return { broker: value, cards, resolved }
}

describe('elicitation schema projection', () => {
  it('projects every supported field kind', () => {
    const projected = projectElicitation({ sessionId: 's', mode: 'form', message: 'Fill hunter2', requestedSchema: { type: 'object', title: 'Setup', required: ['name', 'ok'], properties: {
      name: { type: 'string', minLength: 1, maxLength: 20, format: 'email', default: 'a@b.c' },
      size: { type: 'integer', minimum: 1, maximum: 5 },
      ratio: { type: 'number' },
      ok: { type: 'boolean', default: true },
      tone: { type: 'string', enum: ['soft', 'loud'] },
      tags: { type: 'array', items: { anyOf: [{ const: 'a', title: 'A' }] }, maxItems: 1 },
    } } } as CreateElicitationRequest, text => text.replace('hunter2', '[redacted]'))
    expect(projected).toEqual({ mode: 'form', message: 'Fill [redacted]', title: 'Setup', fields: [
      { key: 'name', type: 'text', required: true, minLength: 1, maxLength: 20, format: 'email', default: 'a@b.c' },
      { key: 'size', type: 'number', required: false, integer: true, minimum: 1, maximum: 5 },
      { key: 'ratio', type: 'number', required: false, integer: false },
      { key: 'ok', type: 'boolean', required: true, default: true },
      { key: 'tone', type: 'choice', required: false, options: [{ value: 'soft', label: 'soft' }, { value: 'loud', label: 'loud' }] },
      { key: 'tags', type: 'multi-choice', required: false, maxItems: 1, options: [{ value: 'a', label: 'A' }] },
    ] })
  })

  it('declines unsupported fields, unsafe links and unknown modes', () => {
    const sanitize = (text: string) => text
    expect(projectElicitation({ sessionId: 's', mode: 'form', message: 'x', requestedSchema: { properties: { file: { type: 'object' } } } } as unknown as CreateElicitationRequest, sanitize)).toBeUndefined()
    expect(projectElicitation({ sessionId: 's', mode: 'url', message: 'x', url: 'javascript:alert(1)', elicitationId: 'e' } as CreateElicitationRequest, sanitize)).toBeUndefined()
    expect(projectElicitation({ sessionId: 's', mode: 'url', message: 'x', url: 'http://example.com', elicitationId: 'e' } as CreateElicitationRequest, sanitize)).toBeUndefined()
    expect(projectElicitation({ sessionId: 's', mode: 'url', message: 'x', url: 'http://127.0.0.1:4000/cb', elicitationId: 'e' } as CreateElicitationRequest, sanitize)).toMatchObject({ mode: 'url', host: '127.0.0.1:4000' })
    expect(projectElicitation({ sessionId: 's', mode: '_custom', message: 'x' } as CreateElicitationRequest, sanitize)).toBeUndefined()
  })
})

describe('elicitation broker', () => {
  it('forwards only validated content and never emits entered values', async () => {
    const { broker: elicitations, cards, resolved } = broker()
    const answer = elicitations.request('agent', askUserQuestion)
    await expect.poll(() => cards.length).toBe(1)
    expect(cards[0]).toMatchObject({ agentId: 'agent', threadId: 'thread', mode: 'form', message: 'Which color?' })
    expect(elicitations.reply(cards[0].requestId, 'accept', { question_0: 'green' })).toBe(false)
    expect(elicitations.reply(cards[0].requestId, 'accept', { question_0: 'red', question_0_custom: 'secret note' })).toBe(true)
    expect(await answer).toEqual({ action: 'accept', content: { question_0: 'red', question_0_custom: 'secret note' } })
    expect(resolved).toEqual([{ requestId: cards[0].requestId, reason: 'answered' }])
    expect(JSON.stringify([cards, resolved])).not.toContain('secret note')
    elicitations.close()
  })

  it('cancels on timeout, turn end, agent abort and foreign sessions', async () => {
    const { broker: elicitations, cards, resolved } = broker(20)
    expect(await elicitations.request('agent', { ...askUserQuestion, sessionId: 'other' } as CreateElicitationRequest)).toEqual({ action: 'cancel' })
    expect(await elicitations.request('agent', askUserQuestion)).toEqual({ action: 'cancel' })
    expect(resolved.at(-1)?.reason).toBe('expired')
    const { broker: idle, cards: idleCards, resolved: idleResolved } = broker()
    const settled = idle.request('agent', askUserQuestion)
    await expect.poll(() => idleCards.length).toBe(1)
    idle.settle('agent', 'session')
    expect(await settled).toEqual({ action: 'cancel' })
    const abort = new AbortController()
    const aborted = idle.request('agent', askUserQuestion, abort.signal)
    await expect.poll(() => idleCards.length).toBe(2)
    abort.abort()
    expect(await aborted).toEqual({ action: 'cancel' })
    expect(idleResolved.map(item => item.reason)).toEqual(['cancelled', 'cancelled'])
    expect(cards).toHaveLength(1)
    elicitations.close()
    idle.close()
  })

  it('keeps an accepted link waiting until the agent completes it', async () => {
    const { broker: elicitations, cards, resolved } = broker()
    const answer = elicitations.request('agent', { sessionId: 'session', mode: 'url', message: 'Sign in', url: 'https://auth.example.com/x', elicitationId: 'oauth' } as CreateElicitationRequest)
    await expect.poll(() => cards.length).toBe(1)
    expect(elicitations.reply(cards[0].requestId, 'accept')).toBe(true)
    expect(await answer).toEqual({ action: 'accept' })
    expect(resolved).toEqual([])
    elicitations.complete('agent', 'oauth')
    expect(resolved).toEqual([{ requestId: cards[0].requestId, reason: 'completed' }])
    elicitations.close()
  })
})

describe('elicitation over ACP', () => {
  it('advertises form and url support and round-trips an answer', async () => {
    const { manager } = await fakeManager('elicit-form')
    const cards: UiAgentElicitation[] = []
    manager.onUpdate((event) => {
      if (event.type === 'elicitation') cards.push(event.value)
    })
    const prompt = manager.prompt({ threadId: 'one', text: 'Ask' })
    await expect.poll(() => cards.length).toBe(1)
    expect(cards[0]).toMatchObject({ threadId: 'one', mode: 'form', fields: [{ key: 'color', type: 'choice', required: true }, { key: 'note', type: 'text', required: false }] })
    manager.replyElicitation(cards[0].requestId, 'accept', { color: 'blue' })
    expect(JSON.parse((await prompt).text)).toEqual({ action: 'accept', content: { color: 'blue' } })
  })

  it('clears a link card once the agent reports completion', async () => {
    const { manager } = await fakeManager('elicit-url')
    const events: string[] = []
    manager.onUpdate((event) => {
      if (event.type === 'elicitation') events.push(`${event.value.mode}:${'host' in event.value ? event.value.host : ''}`)
      if (event.type === 'elicitation-resolved') events.push(event.value.reason)
    })
    expect(JSON.parse((await manager.prompt({ threadId: 'one', text: 'Login' })).text)).toEqual({ action: 'cancel' })
    expect(events).toEqual(['url:auth.example.com', 'completed'])
  })

  it('resolves the card when the agent cancels its request', async () => {
    const { manager } = await fakeManager('elicit-cancel')
    const reasons: string[] = []
    manager.onUpdate((event) => {
      if (event.type === 'elicitation-resolved') reasons.push(event.value.reason)
    })
    await manager.prompt({ threadId: 'one', text: 'Ask' })
    expect(reasons).toEqual(['cancelled'])
  })
})
