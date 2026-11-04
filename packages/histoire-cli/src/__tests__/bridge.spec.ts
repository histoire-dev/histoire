import type { RuntimeSendResult } from '@histoire/dev-proxy/protocol'
import type { TerminalOperationMap } from '../terminal/protocol/core.js'
import { describe, expect, it } from 'vitest'
import { createTerminalBridge } from '../terminal/bridge.js'
import { TERMINAL_BOUNDS } from '../terminal/protocol/core.js'
import { settleTimers } from './utils/flush.js'

/** Operation map used only by these tests. */
interface Ops extends TerminalOperationMap {
  'demo.read': { args: { n: number }, result: number }
}

/** Bridge over a recording transport that answers with a scripted delivery result. */
function createSubject(deliver: (id: string) => Promise<RuntimeSendResult> | RuntimeSendResult = () => ({ ok: true, generation: 'g1' }), timeoutMs?: number) {
  const sent: string[] = []
  let counter = 0
  const bridge = createTerminalBridge<Ops>({ timeoutMs, createId: () => `id${++counter}`, transport: { async send(command) {
    sent.push(command.id)
    return deliver(command.id)
  } } })
  return { bridge, sent }
}

/** Waits for the transport to have received `count` commands. */
async function delivered(subject: ReturnType<typeof createSubject>, count: number) {
  await expect.poll(() => subject.sent.length).toBe(count)
}

// Boundary: real bridge registry/timers. The transport is the one substituted
// seam; real IPC delivery is covered by runtime-output.spec.ts.
describe('terminal bridge', () => {
  it('resolves on the matching reply and surfaces coded failures', async () => {
    const { bridge, sent } = createSubject()
    const ok = bridge.send('demo.read', { n: 1 })
    await expect.poll(() => sent.length).toBe(1)
    bridge.receive({ type: 'runtime-reply', generation: 'g1', id: 'id1', ok: true, result: 7 })
    await expect(ok).resolves.toBe(7)
    const bad = bridge.send('demo.read', { n: 2 })
    await expect.poll(() => sent.length).toBe(2)
    bridge.receive({ type: 'runtime-reply', generation: 'g1', id: 'id2', ok: false, error: { code: 'unsupported', message: 'nope' } })
    await expect(bad).rejects.toMatchObject({ code: 'unsupported', message: 'nope' })
    expect(bridge.pending).toBe(0)
  })

  it('times out without retrying, then ignores the late reply', async () => {
    const subject = createSubject(undefined, 20)
    const read = subject.bridge.send('demo.read', { n: 1 })
    await expect(read).rejects.toMatchObject({ code: 'timeout' })
    subject.bridge.receive({ type: 'runtime-reply', generation: 'g1', id: 'id1', ok: true, result: 1 })
    expect(subject.sent).toEqual(['id1'])
    expect(subject.bridge.pending).toBe(0)
  })

  it('rejects the 33rd pending read immediately as busy', async () => {
    const { bridge } = createSubject()
    const reads = Array.from({ length: TERMINAL_BOUNDS.pendingReads }, () => bridge.send('demo.read', { n: 0 }))
    await expect(bridge.send('demo.read', { n: 0 })).rejects.toMatchObject({ code: 'busy' })
    bridge.close()
    await Promise.allSettled(reads)
  })

  it('fails fast when no ready runtime accepts the command', async () => {
    const { bridge } = createSubject(() => ({ ok: false, reason: 'restarting' }))
    await expect(bridge.send('demo.read', { n: 1 })).rejects.toMatchObject({ code: 'unavailable', message: expect.stringContaining('restarting') })
    expect(bridge.pending).toBe(0)
  })

  it('rejects commands the child would drop (frame bound inside the envelope, identifier length) before sending', async () => {
    const { bridge, sent } = createSubject()
    // Alone this command is exactly at the bound; the proxy's `runtime-command` envelope pushes it over.
    const overhead = JSON.stringify({ id: 'id1', operation: 'demo.read', args: { n: '' } }).length
    await expect(bridge.send('demo.read', { n: 'x'.repeat(TERMINAL_BOUNDS.frameBytes - overhead) as never })).rejects.toMatchObject({ code: 'invalid' })
    await expect(bridge.send('x'.repeat(TERMINAL_BOUNDS.idLength + 1) as 'demo.read', { n: 1 })).rejects.toMatchObject({ code: 'invalid' })
    expect(sent).toEqual([])
  })

  it('rejects reads of a retired generation and keeps its late reply from settling a successor read with the same id', async () => {
    let generation = 'g1'
    const reusedId = createTerminalBridge<Ops>({ createId: () => 'same', transport: { send: async () => ({ ok: true, generation }) } })
    const first = reusedId.send('demo.read', { n: 1 })
    await expect.poll(() => reusedId.pending).toBe(1)
    await settleTimers(5)
    reusedId.retire('g1')
    await expect(first).rejects.toMatchObject({ code: 'retired' })
    generation = 'g2'
    const second = reusedId.send('demo.read', { n: 2 })
    await settleTimers(5)
    reusedId.receive({ type: 'runtime-reply', generation: 'g1', id: 'same', ok: true, result: 'stale' })
    expect(reusedId.pending).toBe(1)
    reusedId.receive({ type: 'runtime-reply', generation: 'g2', id: 'same', ok: true, result: 'fresh' })
    await expect(second).resolves.toBe('fresh')
  })

  it('rejects a read whose delivery resolves after its generation retired', async () => {
    let deliver!: (result: RuntimeSendResult) => void
    const subject = createSubject(() => new Promise(resolve => (deliver = resolve)))
    const read = subject.bridge.send('demo.read', { n: 1 })
    await delivered(subject, 1)
    subject.bridge.retire('g1')
    deliver({ ok: true, generation: 'g1' })
    await expect(read).rejects.toMatchObject({ code: 'retired' })
  })

  it('delivers current events to isolated listeners, ignores retired generations, and rejects everything on close', async () => {
    const { bridge, sent } = createSubject()
    const seen: unknown[] = []
    bridge.subscribe(() => {
      throw new Error('listener fault')
    })
    bridge.subscribe(event => seen.push(event.data))
    bridge.receive({ type: 'runtime-event', generation: 'g0', event: 'log', data: 'first' })
    bridge.retire('g0')
    bridge.receive({ type: 'runtime-event', generation: 'g0', event: 'log', data: 'stale' })
    bridge.receive({ type: 'runtime-event', generation: 'g2', event: 'log', data: 'second' })
    expect(seen).toEqual(['first', 'second'])
    const pending = bridge.send('demo.read', { n: 1 })
    await expect.poll(() => sent.length).toBe(1)
    bridge.close()
    await expect(pending).rejects.toMatchObject({ code: 'closed' })
    await expect(bridge.send('demo.read', { n: 1 })).rejects.toMatchObject({ code: 'closed' })
  })
})
