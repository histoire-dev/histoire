import type { TerminalSessionOptions } from '../terminal/session.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTerminalBridge } from '../terminal/bridge.js'
import { createLogHistory } from '../terminal/output/history.js'
import { createProgressState } from '../terminal/progress/state.js'
import { createTerminalSession } from '../terminal/session.js'
import { settleTimers } from './utils/flush.js'
import { createFakeTerminal } from './utils/terminal/streams.js'

/** Lets queued stream events and readline callbacks run. */

/** Session over an in-memory terminal with a stub host. */
function createRig(options: { columns?: number, rows?: number, tty?: boolean, bind?: boolean } & Partial<TerminalSessionOptions> = {}) {
  const { columns, rows, tty, bind = true, ...sessionOptions } = options
  const terminal = createFakeTerminal({ columns, rows, tty })
  const progress = createProgressState()
  const host = { restart: vi.fn(async () => {}), openBrowser: vi.fn(async () => {}), close: vi.fn(async () => {}) }
  const session = createTerminalSession({
    version: '1.2.3',
    logs: createLogHistory(),
    progress,
    bridge: createTerminalBridge({ transport: { send: async () => ({ ok: false, reason: 'starting' }) } }),
    stdin: terminal.stdin,
    stdout: terminal.stdout,
    environment: { TERM: 'xterm-256color' },
    execArgv: [],
    ...sessionOptions,
  })
  session.onListening('http://localhost:6006/')
  if (bind) session.bind(host)
  return { terminal, session, host, progress }
}

afterEach(() => vi.useRealTimers())

describe('terminal session activation', () => {
  it('fails before any work for an invalid HISTOIRE_TUI value', () => {
    expect(() => createRig({ environment: { TERM: 'xterm', HISTOIRE_TUI: 'maybe' } })).toThrow('Invalid HISTOIRE_TUI')
  })

  it('installs no reader and writes only plain text for non-interactive stdin', async () => {
    const { terminal, session } = createRig({ tty: false })
    expect(session.mode).toBe('plain')
    expect(terminal.stdin.listenerCount('data')).toBe(0)
    expect(terminal.stdin.listenerCount('keypress')).toBe(0)
    expect(terminal.stdin.isRaw).toBe(false)
    session.line('  Histoire: http://localhost:6006/')
    session.passthrough.stdout.write('child output\n')
    expect(terminal.output()).toBe('  Histoire: http://localhost:6006/\nchild output\n')
    await session.shutdown()
  })

  it('says once when an explicit request cannot be honored', () => {
    const { terminal } = createRig({ tty: false, flag: true })
    expect(terminal.output()).toBe('Interactive terminal unavailable (not an interactive terminal), using plain output\n')
  })

  it('shows the panel in a terminal, and explicit enable overrides CI and inspector', () => {
    expect(createRig().session.mode).toBe('tui')
    expect(createRig({ environment: { TERM: 'xterm', CI: 'true' } }).session.mode).toBe('plain')
    expect(createRig({ environment: { TERM: 'xterm', CI: 'true' }, flag: true, execArgv: ['--inspect'] }).session.mode).toBe('tui')
    expect(createRig({ flag: false }).session.mode).toBe('plain')
  })
})

describe('terminal session in the panel', () => {
  it('shows the address and runs main actions against the host', async () => {
    // No views registered, so `l` is a contracted but unavailable shortcut.
    const { terminal, host, session } = createRig({ viewFactories: [] })
    expect(terminal.screen().lines().join('\n')).toContain('Local  http://localhost:6006/')
    terminal.type('r')
    terminal.type('R')
    terminal.type('o')
    await settleTimers(15)
    expect(host.restart.mock.calls).toEqual([[{ cause: 'manual', fresh: false }], [{ cause: 'manual', fresh: true }]])
    expect(host.openBrowser).toHaveBeenCalledWith('http://localhost:6006/')
    terminal.type('l')
    await settleTimers(15)
    expect(terminal.screen().lines().join('\n')).toContain('Logs is not available yet')
    terminal.type('y')
    await settleTimers(15)
    expect(terminal.screen().lines().join('\n')).toContain('Copy unavailable: clipboard is not available')
    await session.shutdown()
  })

  it('keeps the tests and stories hints when a narrow panel drops hints', async () => {
    const { terminal, session } = createRig({ columns: 60 })
    const screen = terminal.screen().lines().join('\n')
    for (const hint of ['o open', 't tests', 'p stories', '? help', 'q quit']) expect(screen).toContain(hint)
    await session.shutdown()
  })

  it('opens help on the alternate screen and leaves main actions alone there', async () => {
    const { terminal, host, session } = createRig()
    terminal.type('?')
    await settleTimers(15)
    expect(terminal.screen().alternate).toBe(true)
    expect(terminal.screen().lines().join('\n')).toContain('Histoire help')
    terminal.type('rR')
    await settleTimers(15)
    expect(host.restart).not.toHaveBeenCalled()
    terminal.type('q')
    await settleTimers(15)
    expect(terminal.screen().alternate).toBe(false)
    expect(host.close).not.toHaveBeenCalled()
    await session.shutdown()
  })

  it('quits through one shutdown, restores the terminal first, and ignores later input', async () => {
    const order: string[] = []
    const { terminal, host, session } = createRig()
    host.close.mockImplementation(async () => {
      order.push(`close raw=${terminal.stdin.isRaw} cursor=${terminal.screen().cursorVisible}`)
    })
    terminal.type('q')
    await settleTimers(15)
    terminal.type('qr')
    await settleTimers(15)
    await session.shutdown()
    expect(order).toEqual(['close raw=false cursor=true'])
    expect(host.restart).not.toHaveBeenCalled()
    expect(terminal.stdin.listenerCount('keypress')).toBe(0)
    expect(terminal.stdout.listenerCount('resize')).toBe(0)
  })

  it('quits on Ctrl+C even inside a screen', async () => {
    const { terminal, host } = createRig()
    terminal.type('?')
    await settleTimers(15)
    terminal.type('\u0003')
    await settleTimers(15)
    expect(host.close).toHaveBeenCalledTimes(1)
  })

  it('restores the terminal and reports cleanup failure when closing the host fails', async () => {
    const { terminal, host, session } = createRig()
    host.close.mockRejectedValue(new Error('runtime did not stop'))
    await expect(session.shutdown()).rejects.toThrow('runtime did not stop')
    expect(terminal.stdin.isRaw).toBe(false)
    expect(terminal.screen().cursorVisible).toBe(true)
  })
})

describe('terminal session fallback', () => {
  it('uses plain output below the minimum size and returns to the panel with a single key owner', async () => {
    const { terminal, session, host } = createRig({ columns: 39, rows: 9 })
    expect(session.mode).toBe('plain')
    for (let cycle = 0; cycle < 4; cycle++) {
      terminal.resize(80, 24)
      expect(session.mode).toBe('tui')
      expect(terminal.stdin.listenerCount('keypress')).toBe(1)
      terminal.resize(39, 9)
      expect(session.mode).toBe('plain')
      expect(terminal.stdin.listenerCount('keypress')).toBe(0)
      expect(terminal.stdin.isRaw).toBe(false)
    }
    expect(terminal.output()).toContain('Terminal too small for the interactive panel, using plain output')
    terminal.resize(80, 24)
    terminal.type('r')
    await settleTimers(15)
    expect(host.restart).toHaveBeenCalledTimes(1)
    await session.shutdown()
  })

  it('keeps open plain commands working while small and keeps the server on renderer failure', async () => {
    const { terminal, session, host } = createRig()
    const write = terminal.stdout.write.bind(terminal.stdout)
    let broken = true
    terminal.stdout.write = ((...args: Parameters<typeof write>) => {
      if (broken && String(args[0]).includes('late')) throw new Error('EPIPE')
      return write(...args)
    }) as typeof terminal.stdout.write
    session.passthrough.stdout.write('late log\n')
    broken = false
    expect(session.mode).toBe('plain')
    expect(terminal.output()).toContain('Terminal rendering failed (EPIPE). Using plain output')
    expect(terminal.stdin.isRaw).toBe(false)
    // The failure is permanent: a bigger terminal does not bring the panel back.
    terminal.resize(120, 40)
    expect(session.mode).toBe('plain')
    terminal.type('restart fresh\n')
    await settleTimers(15)
    expect(host.restart).toHaveBeenCalledWith({ cause: 'manual', fresh: true })
    expect(host.close).not.toHaveBeenCalled()
    await session.shutdown()
  })

  it('prints real readiness once in plain mode and accepts quit', async () => {
    let now = 0
    const progress = createProgressState({ now: () => now })
    const { terminal, host } = createRig({ flag: false, progress })
    progress.onRuntimeStart({ generation: 'g1', fresh: false })
    now = 2300
    progress.onStatus({ status: 'ready' })
    progress.onStatus({ status: 'ready' })
    expect(terminal.output().match(/Ready in 2\.3s/g)).toHaveLength(1)
    terminal.type('quit\n')
    await settleTimers(15)
    expect(host.close).toHaveBeenCalledTimes(1)
  })
})

describe('terminal session shutdown during startup', () => {
  it('closes the host once it binds and settles after that close', async () => {
    const { terminal, session, host } = createRig({ bind: false })
    terminal.type('q')
    await settleTimers(15)
    expect(terminal.stdin.isRaw).toBe(false)
    let settled = false
    const pending = session.shutdown().then(() => void (settled = true))
    await settleTimers(15)
    expect(settled).toBe(false)
    expect(host.close).not.toHaveBeenCalled()
    session.bind(host)
    await pending
    expect(host.close).toHaveBeenCalledTimes(1)
  })
})

describe('terminal session suspend and resume', () => {
  it('releases the terminal on suspend and re-detects it on SIGCONT', async () => {
    const suspendProcess = vi.fn()
    const { terminal, session } = createRig({ suspendProcess })
    terminal.type('\u001A')
    await settleTimers(15)
    expect(suspendProcess).toHaveBeenCalledTimes(1)
    expect(terminal.stdin.isRaw).toBe(false)
    expect(terminal.screen().cursorVisible).toBe(true)
    process.emit('SIGCONT')
    expect(session.mode).toBe('tui')
    expect(terminal.stdin.isRaw).toBe(true)
    expect(terminal.stdin.listenerCount('keypress')).toBe(1)
    process.emit('SIGCONT')
    expect(terminal.stdin.listenerCount('keypress')).toBe(1)
    await session.shutdown()
  })

  it('resumes by itself when the stop signal did not stop the process', async () => {
    vi.useFakeTimers()
    const { terminal, session } = createRig({ suspendProcess: vi.fn() })
    terminal.type('\u001A')
    await vi.advanceTimersByTimeAsync(20)
    expect(session.mode).toBe('plain')
    await vi.advanceTimersByTimeAsync(400)
    expect(session.mode).toBe('tui')
    await session.shutdown()
  })
})
