import type { ActionHost } from '../terminal/actions.js'
import type { TerminalView, TerminalViewFactory, TerminalViewHost } from '../terminal/views/registry.js'
import { describe, expect, it } from 'vitest'
import { dispatchKey } from '../terminal/dispatch.js'
import { createSearchInput } from '../terminal/navigation/search.js'
import { createHelpView } from '../terminal/views/help.js'
import { createViewRegistry } from '../terminal/views/registry.js'
import { settleTimers } from './utils/flush.js'
import { press } from './utils/terminal/view-host.js'

/** Logs-like view with a search prompt, as a later slice would register it. */
const createSearchableView: TerminalViewFactory = (): TerminalView => {
  const search = createSearchInput()
  return {
    id: 'logs',
    shortcut: 'l',
    title: 'Logs',
    capturesInput: search.active,
    handleKey: key => search.handleKey(key),
    render: () => [`search:${search.text()}`],
  }
}

/** Dispatch rig recording every action the main screen performs. */
function createRig(factories: readonly TerminalViewFactory[]) {
  const calls: string[] = []
  const actions: ActionHost = {
    restart: async request => void calls.push(request.fresh ? 'restart-fresh' : 'restart'),
    openBrowser: async () => void calls.push('open'),
    url: () => 'http://localhost:6006/',
    copy: async () => ({ ok: false, reason: 'clipboard is not available' }),
    clearScreen: () => void calls.push('clear'),
    quit: () => void calls.push('quit'),
    report: text => void calls.push(`report:${text}`),
  }
  const host = { shortcuts: () => registry.summary(), size: () => ({ columns: 80, rows: 24 }) } as unknown as TerminalViewHost
  const registry = createViewRegistry(host, factories)
  let active: TerminalView | undefined
  const context = { actions, registry, activeView: () => active, openView: (view: TerminalView) => (active = view), closeView: () => (active = undefined), suspend: () => void calls.push('suspend') }
  return { calls, registry, send: (...keys: string[]) => keys.forEach(text => dispatchKey(context, press(text))), active: () => active }
}

describe('main key dispatch', () => {
  it('runs the main actions', async () => {
    const rig = createRig([])
    rig.send('r', 'R', 'o', 'c', 'q')
    await settleTimers()
    expect(rig.calls).toContain('restart')
    expect(rig.calls).toContain('restart-fresh')
    expect(rig.calls).toContain('open')
    expect(rig.calls).toContain('clear')
    expect(rig.calls).toContain('quit')
  })

  it('says plainly when copy is unavailable', async () => {
    const rig = createRig([])
    rig.send('y')
    await settleTimers()
    expect(rig.calls).toContain('report:Copy unavailable: clipboard is not available')
  })

  it('reports an unavailable view until it is registered, then opens it automatically', () => {
    const before = createRig([])
    before.send('l', 'i')
    expect(before.calls).toEqual(['report:Logs is not available yet', 'report:Session info is not available yet'])
    const after = createRig([createSearchableView])
    after.send('l')
    expect(after.active()?.id).toBe('logs')
    expect(after.calls).toEqual([])
  })
})

describe('screen key context', () => {
  it('does not dispatch main actions inside help', () => {
    const rig = createRig([createHelpView])
    rig.send('?')
    expect(rig.active()?.id).toBe('help')
    rig.send('r', 'R', 'o', 'c', 'y')
    expect(rig.calls).toEqual([])
    rig.send('q')
    expect(rig.active()).toBeUndefined()
    expect(rig.calls).toEqual([])
  })

  it('lets a search prompt consume action keys, cancel with Escape, and still quit with Ctrl+C', () => {
    const rig = createRig([createSearchableView])
    rig.send('l', '/')
    rig.send('q', 'r', 'R', 'o', 'c')
    expect(rig.calls).toEqual([])
    expect(rig.active()?.id).toBe('logs')
    rig.send('\u001B')
    expect(rig.active()?.id).toBe('logs')
    rig.send('/', 'x', '\u0003')
    expect(rig.calls).toEqual(['quit'])
    rig.send('\u001B', '\u001B')
    expect(rig.active()).toBeUndefined()
  })
})

describe('view registry', () => {
  it('rejects duplicate ids and shortcuts, reserved main keys, and keys outside the main table', () => {
    const host = {} as TerminalViewHost
    const view = (id: string, shortcut: string): TerminalViewFactory => () => ({ id, shortcut, title: id, run: () => {} })
    expect(() => createViewRegistry(host, [view('a', 'l'), view('b', 'l')])).toThrow('Duplicate view')
    expect(() => createViewRegistry(host, [view('a', 'l'), view('a', 'i')])).toThrow('Duplicate view')
    expect(() => createViewRegistry(host, [view('a', 'r')])).toThrow('reserved')
    expect(() => createViewRegistry(host, [view('a', 'z')])).toThrow('not part of the main key table')
    expect(() => createViewRegistry(host, [() => ({ id: 'a', shortcut: 'l', title: 'a' })])).toThrow('needs run')
  })
})
