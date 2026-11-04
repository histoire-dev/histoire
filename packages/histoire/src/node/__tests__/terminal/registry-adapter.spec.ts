import type { RuntimeEvent, RuntimeReply } from '@histoire/dev-proxy/protocol'
import type { ProjectRuntimeHandle } from '../../runtime/types.js'
import { TerminalError } from '@histoire/cli/protocol/core'
import { describe, expect, it } from 'vitest'
import { createExecutionService } from '../../runtime/execution-service.js'
import { createTerminalAdapter } from '../../runtime/terminal/adapter.js'
import { createCommandRegistry } from '../../runtime/terminal/registry.js'
import { settleTimers } from '../utils/flush.js'

/** Adapter over a real execution lane, recording frames; only the runtime handle identity is stubbed. */
function createSubject(handlers: Parameters<typeof createTerminalAdapter>[0]['handlers']) {
  const frames: Array<RuntimeReply | RuntimeEvent> = []
  const execution = createExecutionService()
  const adapter = createTerminalAdapter({ generation: 'g1', send: (frame) => {
    frames.push(frame)
    return true
  }, execution: () => execution, handlers })
  const handle = { context: {} } as ProjectRuntimeHandle
  return { frames, adapter, handle, execution }
}

/** Waits until the adapter produced `count` frames. */
async function frames(subject: ReturnType<typeof createSubject>, count: number) {
  await expect.poll(() => subject.frames.length).toBeGreaterThanOrEqual(count)
  return subject.frames
}

// Boundary: real adapter/registry/execution owner. Defects: per-domain switches,
// replies leaking past generation release, wrong-generation commands acting.
describe('terminal command registry and adapter', () => {
  it('rejects duplicate operations at startup', () => {
    const handler = { operation: 'x.y', handle: async () => 1 }
    expect(() => createCommandRegistry([handler, handler])).toThrow('Duplicate')
  })

  it('answers correlated results, coded failures, and unsupported operations', async () => {
    const subject = createSubject([
      { operation: 'demo.echo', handle: async args => ({ args }) },
      { operation: 'demo.fail', handle: async () => Promise.reject(new TerminalError('invalid', 'bad args')) },
      { operation: 'demo.event', handle: async (_args, context) => {
        context.emit('log', { level: 'info', text: 'hi' })
        return 'done'
      } },
    ])
    subject.adapter.onGeneration(subject.handle)
    for (const [id, operation] of [['1', 'demo.echo'], ['2', 'demo.fail'], ['3', 'demo.nope'], ['4', 'demo.event']]) {
      expect(subject.adapter.receive({ type: 'runtime-command', generation: 'g1', id, operation, args: { id } })).toBe(true)
    }
    await frames(subject, 5)
    const byId = Object.fromEntries(subject.frames.filter(frame => frame.type === 'runtime-reply').map(frame => [(frame as RuntimeReply).id, frame]))
    expect(byId['1']).toMatchObject({ ok: true, result: { args: { id: '1' } } })
    expect(byId['2']).toMatchObject({ ok: false, error: { code: 'invalid' } })
    expect(byId['3']).toMatchObject({ ok: false, error: { code: 'unsupported' } })
    expect(subject.frames.find(frame => frame.type === 'runtime-event')).toMatchObject({ generation: 'g1', event: 'log', data: { text: 'hi' } })
  })

  it('ignores commands for another generation and malformed frames', () => {
    const subject = createSubject([])
    subject.adapter.onGeneration(subject.handle)
    expect(subject.adapter.receive({ type: 'runtime-command', generation: 'other', id: '1', operation: 'a' })).toBe(false)
    expect(subject.adapter.receive({ type: 'runtime-command', generation: 'g1', id: '', operation: 'a' })).toBe(false)
    expect(subject.frames).toEqual([])
  })

  it('fails commands before a generation is attached', async () => {
    const subject = createSubject([{ operation: 'a', handle: async () => 1 }])
    subject.adapter.receive({ type: 'runtime-command', generation: 'g1', id: '1', operation: 'a' })
    expect((await frames(subject, 1))[0]).toMatchObject({ ok: false, error: { code: 'unavailable' } })
  })

  it('suppresses the reply of work still running when the generation is released', async () => {
    let finish!: () => void
    const subject = createSubject([{ operation: 'slow', handle: () => new Promise(resolve => (finish = () => resolve('late'))) }])
    subject.adapter.onGeneration(subject.handle)
    subject.adapter.receive({ type: 'runtime-command', generation: 'g1', id: '1', operation: 'slow' })
    await subject.adapter.onBeforeRelease(subject.handle)
    finish()
    subject.adapter.receive({ type: 'runtime-command', generation: 'g1', id: '2', operation: 'slow' })
    // The suppressed reply would arrive a turn after the synchronous refusal; wait it out before counting.
    await settleTimers()
    expect(subject.frames).toHaveLength(1)
    expect(subject.frames[0]).toMatchObject({ id: '2', ok: false, error: { code: 'unavailable' } })
  })

  it('refuses results above the frame bound', async () => {
    const subject = createSubject([{ operation: 'big', handle: async () => 'x'.repeat(300_000) }])
    subject.adapter.onGeneration(subject.handle)
    subject.adapter.receive({ type: 'runtime-command', generation: 'g1', id: '1', operation: 'big' })
    expect((await frames(subject, 1))[0]).toMatchObject({ ok: false, error: { code: 'failed' } })
  })
})
