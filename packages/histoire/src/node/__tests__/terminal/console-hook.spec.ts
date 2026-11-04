import type { TerminalLogEvent } from '@histoire/cli/protocol/core'
import { Console } from 'node:console'
import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { installConsoleObserver } from '../../runtime/terminal/console-hook.js'

/** Real Node console over in-memory streams, so emission goes through Node's own formatting. */
function createSubject() {
  const raw = { stdout: '', stderr: '' }
  const stream = (key: 'stdout' | 'stderr') => new Writable({ write(chunk, _encoding, done) {
    raw[key] += chunk.toString()
    done()
  } })
  const stdout = stream('stdout')
  const stderr = stream('stderr')
  const target = new Console({ stdout, stderr })
  const events: TerminalLogEvent[] = []
  return { raw, stdout, stderr, target, events, observer: installConsoleObserver(target) }
}

// Boundary: Node's real Console formatting. Defects: duplicate echo, lost
// groups/levels/multiline text, dropped output on failure, hooks clobbering others.
describe('console observer', () => {
  it('writes raw output until activated, then replaces it once per intercepted call', () => {
    const { target, raw, events, observer } = createSubject()
    target.log('before')
    observer.activate(event => void events.push(event))
    target.log('multi\nline', { a: 1 })
    target.info('info')
    target.warn('warn')
    target.error(new Error('boom').message)
    target.debug('debug')
    expect(raw.stdout).toBe('before\n')
    expect(raw.stderr).toBe('')
    expect(events).toEqual([
      { level: 'log', text: 'multi\nline { a: 1 }' },
      { level: 'info', text: 'info' },
      { level: 'warn', text: 'warn' },
      { level: 'error', text: 'boom' },
      { level: 'debug', text: 'debug' },
    ])
  })

  it('keeps group indentation, tables and stream-derived levels of calls without a level method', () => {
    const { target, events, observer } = createSubject()
    observer.activate(event => void events.push(event))
    target.group('Group')
    target.log('inner')
    target.groupEnd()
    target.assert(false, 'failed assertion')
    target.table([{ a: 1 }])
    expect(events.map(event => [event.level, event.text.split('\n')[0]])).toEqual([['log', 'Group'], ['log', '  inner'], ['warn', 'Assertion failed: failed assertion'], ['log', '┌─────────┬───┐']])
  })

  it('falls back to the raw stream when forwarding fails and never touches direct stream writes', () => {
    const { target, stdout, raw, observer } = createSubject()
    observer.activate(() => false)
    target.log('kept')
    stdout.write('direct\n')
    expect(raw.stdout).toBe('kept\ndirect\n')
  })

  it('writes text above the log bound raw instead of cutting it', () => {
    const { target, raw, events, observer } = createSubject()
    observer.activate(event => void events.push(event))
    target.log('x'.repeat(20_000))
    target.log('short')
    expect(raw.stdout).toBe(`${'x'.repeat(20_000)}\n`)
    expect(events).toEqual([{ level: 'log', text: 'short' }])
  })

  it('restores only hooks it still owns', () => {
    const { target, raw, observer } = createSubject()
    const later = (..._args: unknown[]) => {}
    observer.activate(() => {})
    target.log = later
    observer.dispose()
    expect(target.log).toBe(later)
    target.error('plain')
    expect(raw.stderr).toBe('plain\n')
  })
})
