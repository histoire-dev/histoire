import { describe, expect, it } from 'vitest'
import { decideTerminalMode, isInspectorAttached, parseTuiEnvironment } from '../terminal/support.js'

/** An ordinary interactive terminal; tests override single facts. */
function inputs(overrides: Partial<Parameters<typeof decideTerminalMode>[0]> = {}): Parameters<typeof decideTerminalMode>[0] {
  return { stdin: { isTTY: true, setRawMode: () => {} }, stdout: { isTTY: true, columns: 80, rows: 24 }, environment: { TERM: 'xterm-256color' }, execArgv: [], ...overrides }
}

describe('terminal activation policy', () => {
  it('uses the panel in an ordinary terminal and plain output otherwise', () => {
    expect(decideTerminalMode(inputs()).mode).toBe('tui')
    expect(decideTerminalMode(inputs({ stdout: { isTTY: false, columns: 80, rows: 24 } })).mode).toBe('plain')
    expect(decideTerminalMode(inputs({ stdin: { isTTY: false } })).mode).toBe('plain')
    expect(decideTerminalMode(inputs({ stdin: { isTTY: true } })).reason).toBe('raw input unavailable')
    expect(decideTerminalMode(inputs({ environment: { TERM: 'dumb' } })).reason).toBe('dumb terminal')
  })

  it('treats 40x10 as the smallest usable size and marks smaller sizes recoverable', () => {
    expect(decideTerminalMode(inputs({ stdout: { isTTY: true, columns: 40, rows: 10 } })).mode).toBe('tui')
    expect(decideTerminalMode(inputs({ stdout: { isTTY: true, columns: 39, rows: 10 } }))).toMatchObject({ mode: 'plain', recoverable: true })
    expect(decideTerminalMode(inputs({ stdout: { isTTY: true, columns: 40, rows: 9 } })).mode).toBe('plain')
  })

  it('disables the panel in CI or with an inspector unless explicitly enabled', () => {
    expect(decideTerminalMode(inputs({ environment: { TERM: 'xterm', CI: 'true' } })).reason).toBe('CI')
    expect(decideTerminalMode(inputs({ environment: { TERM: 'xterm', CI: 'false' } })).mode).toBe('tui')
    expect(decideTerminalMode(inputs({ execArgv: ['--inspect=0'] })).reason).toBe('Node inspector attached')
    expect(decideTerminalMode(inputs({ environment: { TERM: 'xterm', NODE_OPTIONS: '--max-old-space-size=4096 --inspect-brk' } })).mode).toBe('plain')
    expect(decideTerminalMode(inputs({ inspectorUrl: 'ws://127.0.0.1:9229/x' })).mode).toBe('plain')
    expect(decideTerminalMode(inputs({ flag: true, environment: { TERM: 'xterm', CI: '1' }, execArgv: ['--inspect'] })).mode).toBe('tui')
    expect(decideTerminalMode(inputs({ env: '1', environment: { TERM: 'xterm', CI: '1' } })).mode).toBe('tui')
  })

  it('never lets explicit enable override missing capabilities or size', () => {
    expect(decideTerminalMode(inputs({ flag: true, stdout: { isTTY: false } })).mode).toBe('plain')
    expect(decideTerminalMode(inputs({ env: '1', stdout: { isTTY: true, columns: 20, rows: 5 } })).mode).toBe('plain')
    expect(decideTerminalMode(inputs({ flag: true, environment: { TERM: 'dumb' } })).mode).toBe('plain')
  })

  it('applies flag, then environment, then automatic policy', () => {
    expect(decideTerminalMode(inputs({ flag: false, env: '1' })).reason).toBe('--no-tui')
    expect(decideTerminalMode(inputs({ flag: true, env: 'plain' })).mode).toBe('tui')
    expect(decideTerminalMode(inputs({ env: 'plain' })).reason).toBe('HISTOIRE_TUI=plain')
    expect(decideTerminalMode(inputs({ env: 'auto' })).mode).toBe('tui')
  })

  it('rejects unsupported HISTOIRE_TUI values with a concise error', () => {
    expect(parseTuiEnvironment(undefined)).toBe('auto')
    expect(parseTuiEnvironment('')).toBe('auto')
    expect(() => parseTuiEnvironment('yes')).toThrow('Invalid HISTOIRE_TUI value "yes". Use plain, auto or 1')
    expect(() => decideTerminalMode(inputs({ env: '0' }))).toThrow('Invalid HISTOIRE_TUI')
  })

  it('detects inspector options only in their real forms', () => {
    expect(isInspectorAttached(['--inspect-wait'], {})).toBe(true)
    expect(isInspectorAttached([], { NODE_OPTIONS: '--inspect-port=9230' })).toBe(false)
    expect(isInspectorAttached(['--max-old-space-size=100'], {})).toBe(false)
  })
})
