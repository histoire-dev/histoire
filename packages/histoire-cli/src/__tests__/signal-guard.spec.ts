import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createSignalGuard } from '../commands/signal-guard.js'
import { flushMicrotasks } from './utils/flush.js'

/** Builds a guard over fake emitters with spy hooks. */
function setup(shutdown: () => Promise<void> = async () => {}) {
  const processEmitter = new EventEmitter()
  const stdout = new EventEmitter()
  const hooks = { release: vi.fn(), shutdown: vi.fn(shutdown), setExitCode: vi.fn(), exit: vi.fn(), report: vi.fn() }
  const guard = createSignalGuard({ process: processEmitter, stdout, ...hooks })
  return { processEmitter, stdout, guard, ...hooks }
}

describe('signal guard', () => {
  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'])('shuts down on %s and keeps status 0 when cleanup succeeds', async (signal) => {
    const { processEmitter, shutdown, setExitCode } = setup()
    processEmitter.emit(signal)
    await flushMicrotasks()
    expect(shutdown).toHaveBeenCalledOnce()
    expect(setExitCode).not.toHaveBeenCalled()
  })

  it('keeps a nonzero status when teardown fails', async () => {
    const failure = new Error('close failed')
    const { processEmitter, setExitCode, report } = setup(() => Promise.reject(failure))
    processEmitter.emit('SIGTERM')
    await flushMicrotasks()
    expect(report).toHaveBeenCalledWith(failure)
    expect(setExitCode).toHaveBeenCalledTimes(1)
    expect(setExitCode).toHaveBeenCalledWith(1)
  })

  it('releases the terminal before reporting and exiting on a fatal error', () => {
    const { processEmitter, release, report, exit } = setup()
    const order: string[] = []
    release.mockImplementation(() => void order.push('release'))
    report.mockImplementation(() => void order.push('report'))
    exit.mockImplementation(() => void order.push('exit'))
    processEmitter.emit('unhandledRejection', new Error('boom'))
    expect(order).toEqual(['release', 'report', 'exit'])
    expect(exit).toHaveBeenCalledWith(1)
  })

  it('shuts down once on EPIPE and swallows later stdout errors', () => {
    const { stdout, shutdown } = setup()
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
    expect(() => {
      stdout.emit('error', epipe)
      stdout.emit('error', epipe)
    }).not.toThrow()
    expect(shutdown).toHaveBeenCalledOnce()
  })

  it('removes signal and fatal handlers on dispose', () => {
    const { processEmitter, guard, shutdown, exit } = setup()
    guard.dispose()
    expect(processEmitter.listenerCount('SIGHUP')).toBe(0)
    processEmitter.emit('SIGINT')
    expect(shutdown).not.toHaveBeenCalled()
    expect(processEmitter.listenerCount('uncaughtException')).toBe(0)
    expect(exit).not.toHaveBeenCalled()
  })
})
