import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSurface } from '../terminal/surface.js'
import { createFakeTerminal } from './utils/terminal/streams.js'

/** Surface over an emulated 40x12 terminal with editable content. */
function createRig(columns = 40, rows = 12) {
  const terminal = createFakeTerminal({ columns, rows })
  const content = { panel: ['status', 'address', 'hints'], screen: undefined as string[] | undefined }
  const failures: unknown[] = []
  const surface = createSurface({ stdout: terminal.stdout, content: { panel: () => content.panel, screen: () => content.screen }, onFailure: error => failures.push(error) })
  return { terminal, content, surface, failures, lines: () => terminal.screen().lines().filter(line => line !== '') }
}

afterEach(() => vi.useRealTimers())

describe('terminal surface', () => {
  it('keeps the panel pinned under inserted output and never duplicates it', () => {
    const { surface, lines } = createRig()
    surface.attach()
    expect(lines()).toEqual(['status', 'address', 'hints'])
    surface.write('stdout', 'first\nsecond\n')
    surface.write('stderr', 'warning\n')
    expect(lines()).toEqual(['first', 'second', 'warning', 'status', 'address', 'hints'])
    surface.detach()
    // The panel disappears and the cursor returns to where the next shell output belongs.
    expect(lines()).toEqual(['first', 'second', 'warning'])
  })

  it('holds unfinished lines, shows them after a quiet period, and decodes split characters', () => {
    vi.useFakeTimers()
    const { surface, lines } = createRig()
    surface.attach()
    const bytes = Buffer.from('héllo 🚀\n')
    surface.write('stdout', bytes.subarray(0, 2))
    surface.write('stdout', bytes.subarray(2))
    surface.write('stdout', 'no newline yet')
    expect(lines()).toEqual(['héllo 🚀', 'status', 'address', 'hints'])
    vi.advanceTimersByTime(200)
    expect(lines()).toEqual(['héllo 🚀', 'no newline yet', 'status', 'address', 'hints'])
  })

  it('removes cursor-moving controls from child output but cannot be pushed out of place', () => {
    const { surface, lines } = createRig()
    surface.attach()
    surface.write('stdout', 'before\n\u001B[3A\u001B[2Jevil\u001B]0;title\u0007\nafter\n')
    expect(lines()).toEqual(['before', 'evil', 'after', 'status', 'address', 'hints'])
  })

  it('redraws the panel only when it changed', () => {
    const { surface, terminal, content } = createRig()
    surface.attach()
    const before = terminal.output().length
    surface.repaint()
    expect(terminal.output().length).toBe(before)
    content.panel = ['status 2', 'address', 'hints']
    surface.repaint()
    expect(terminal.screen().lines().filter(Boolean)).toEqual(['status 2', 'address', 'hints'])
  })

  it('shows views on the alternate screen, holds output meanwhile, and restores the main screen', () => {
    const { surface, terminal, content, lines } = createRig()
    surface.attach()
    surface.write('stdout', 'kept\n')
    content.screen = ['Help', 'line']
    surface.repaint()
    expect(terminal.screen().alternate).toBe(true)
    expect(lines()).toEqual(['Help', 'line'])
    surface.write('stdout', 'while in help\n')
    expect(lines()).toEqual(['Help', 'line'])
    content.screen = undefined
    surface.repaint()
    expect(terminal.screen().alternate).toBe(false)
    expect(lines()).toEqual(['kept', 'while in help', 'status', 'address', 'hints'])
    expect(terminal.screen().cursorVisible).toBe(false)
    surface.detach()
    expect(terminal.screen().cursorVisible).toBe(true)
  })

  it('leaves the alternate screen on detach even when a view is open', () => {
    const { surface, terminal, content } = createRig()
    surface.attach()
    content.screen = ['Help']
    surface.repaint()
    surface.detach()
    expect(terminal.screen().alternate).toBe(false)
    expect(terminal.screen().cursorVisible).toBe(true)
  })

  it('clears visible output and redraws the panel at the top', () => {
    const { surface, lines } = createRig()
    surface.attach()
    surface.write('stdout', 'a\nb\nc\n')
    surface.clear()
    expect(lines()).toEqual(['status', 'address', 'hints'])
  })

  it('reports a failing stream once and still restores without throwing', () => {
    const { surface, terminal, failures } = createRig()
    surface.attach()
    const write = terminal.stdout.write.bind(terminal.stdout)
    terminal.stdout.write = (() => {
      throw new Error('EIO')
    }) as typeof terminal.stdout.write
    surface.write('stdout', 'lost\n')
    surface.write('stdout', 'lost again\n')
    expect(failures).toHaveLength(1)
    terminal.stdout.write = write
    expect(() => surface.detach()).not.toThrow()
    expect(terminal.screen().cursorVisible).toBe(true)
  })

  it('flushes a fast carriage-return spinner without a quiet period and bounds the tail', () => {
    vi.useFakeTimers()
    const { surface, terminal } = createRig(40, 12)
    surface.attach()
    // Writes keep arriving faster than the quiet period; the first unfinished text must still appear.
    for (let tick = 0; tick < 20; tick++) {
      surface.write('stdout', `\rspin ${tick}`)
      vi.advanceTimersByTime(20)
    }
    expect(terminal.output()).toContain('spin')
    // A huge unterminated stream is cut into bounded rows instead of accumulating.
    const before = terminal.output().length
    surface.write('stdout', 'x'.repeat(100_000))
    expect(terminal.output().length - before).toBeLessThan(40_000)
  })

  it('does not let a carriage return rewrite the row or add bidi controls', () => {
    const { surface, terminal } = createRig()
    surface.attach()
    surface.write('stdout', 'real\rfake\u202E\n')
    expect(terminal.output()).not.toMatch(/[\r\u202E]fake|real\r|\u202E/)
    expect(terminal.screen().lines()).toContain('fake')
  })
})
