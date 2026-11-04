/* eslint-disable no-control-regex -- strips SGR sequences from rendered screens */
import type { TerminalBridge } from '../../../terminal/bridge.js'
import type { ClipboardWriter } from '../../../terminal/clipboard.js'
import type { TerminalKey } from '../../../terminal/keys.js'
import type { ProgressState } from '../../../terminal/progress/state.js'
import type { InfoSection, TerminalView, TerminalViewFactory, TerminalViewHost } from '../../../terminal/views/registry.js'
import { vi } from 'vitest'
import { normalizeKey } from '../../../terminal/keys.js'
import { createLogHistory } from '../../../terminal/output/history.js'
import { createProgressState } from '../../../terminal/progress/state.js'
import { createRequestHistory } from '../../../terminal/requests/history.js'
import { createRetainedHistories } from '../../../terminal/retained.js'
import { getTestTargetHandoff } from '../../../terminal/stories/handoff.js'
import { createTestsClient } from '../../../terminal/tests/client.js'
import { createTestsConsole } from '../../../terminal/tests/console.js'
import { createTestsState } from '../../../terminal/tests/state.js'

/** Bridge that answers `send` with a scripted reply (or rejection). */
export function createScriptedBridge(reply: (operation: string, args: unknown) => unknown): TerminalBridge {
  return {
    send: (async (operation: string, args: unknown) => reply(operation, args)) as TerminalBridge['send'],
    subscribe: () => () => {},
    receive: () => {},
    retire: () => {},
    close: () => {},
    pending: 0,
  }
}

/** Raw control input decoded the way the terminal reports it. */
const RAW_KEYS: Record<string, { name: string, ctrl?: boolean }> = { ' ': { name: 'space' }, '\u001B': { name: 'escape' }, '\r': { name: 'return' }, '\u0003': { name: 'c', ctrl: true } }

/**
 * Text without SGR styling, for assertions on what a screen says.
 * @param text Rendered text.
 */
export function stripSgr(text: string): string {
  return text.replace(/\u001B\[[0-9;]*m/g, '')
}

/** Decoded key from a printable character, raw control input (` `, Escape, `\r`, Ctrl+C) or a key name (`up`, `return`, `escape`, ...). */
export function press(input: string): TerminalKey {
  const named = ['up', 'down', 'pageup', 'pagedown', 'home', 'end', 'return', 'escape', 'backspace', 'tab']
  if (RAW_KEYS[input]) return normalizeKey(input, RAW_KEYS[input])
  return named.includes(input) ? normalizeKey(undefined, { name: input }) : normalizeKey(input, { name: input.toLowerCase() })
}

/**
 * Real log history, progress state and retained registry behind a view host; only the
 * clipboard, bridge and browser are doubles (platform boundaries).
 * @param options Overrides.
 * @param options.copy Clipboard writer; defaults to one recording copied text.
 * @param options.bridge Runtime bridge; defaults to one failing on any call.
 * @param options.url Bound public URL.
 * @param options.networkUrls Network addresses listed by session info.
 * @param options.rows Terminal rows.
 * @param options.columns Terminal columns.
 * @param options.logLimits Retained log bounds.
 * @param options.logLimits.entries Maximum retained entries.
 * @param options.logLimits.bytes Maximum retained bytes.
 * @param options.progress Progress mirror to share; defaults to a fresh one.
 */
export function createViewHostRig(options: { copy?: ClipboardWriter, bridge?: TerminalBridge, url?: string, networkUrls?: string[], rows?: number, columns?: number, logLimits?: { entries?: number, bytes?: number }, progress?: ProgressState } = {}) {
  const logs = createLogHistory(options.logLimits)
  // A caller-owned mirror (e.g. a catalog harness's) lets the views follow that runtime's generations.
  const progress = options.progress ?? createProgressState()
  const requests = createRequestHistory()
  const retained = createRetainedHistories()
  retained.register({ id: 'logs', label: 'log entries', count: () => logs.entries().length, clear: () => logs.clear() })
  let url = options.url ?? 'http://localhost:6006/'
  const notices: string[] = []
  const sections: (() => InfoSection | undefined)[] = []
  const copied: string[] = []
  const segments: (() => string | undefined)[] = []
  const bridge = options.bridge ?? createScriptedBridge(() => {
    throw new Error('unexpected bridge call')
  })
  const testsClient = createTestsClient(bridge)
  const tests = createTestsConsole({ state: createTestsState({ client: testsClient }), client: testsClient, bridge, progress, handoff: getTestTargetHandoff({ bridge }) })
  const host: TerminalViewHost = {
    bridge,
    tests,
    openView: vi.fn(),
    logs,
    requests,
    progress,
    url: () => url,
    size: () => ({ columns: options.columns ?? 80, rows: options.rows ?? 12 }),
    notify: text => void notices.push(text),
    requestRender: vi.fn(),
    close: vi.fn(),
    copy: options.copy ?? (async (text) => {
      copied.push(text)
      return { ok: true }
    }),
    openBrowser: vi.fn(async () => {}),
    shortcuts: () => [],
    retained,
    networkUrls: () => options.networkUrls ?? [],
    addInfoSection: (provider) => {
      sections.push(provider)
      return () => void sections.splice(sections.indexOf(provider), 1)
    },
    infoSections: () => sections.flatMap(provider => provider() ?? []),
    addPanelSegment: (provider) => {
      segments.push(provider)
      return () => void segments.splice(segments.indexOf(provider), 1)
    },
  }
  return {
    host,
    logs,
    requests,
    progress,
    retained,
    notices,
    copied,
    /** Changes the address `host.url()` reports (the workbench URL replaces the public URL once ready). */
    setUrl: (next: string) => void (url = next),
    /** Current main-panel segments. */
    panelSegments: () => segments.flatMap(provider => provider() ?? []),
    /** Instantiates a view, sends it keys and returns helpers. */
    open(factory: TerminalViewFactory) {
      const view: TerminalView = factory(host)
      view.enter?.()
      return {
        view,
        keys: (...inputs: string[]) => inputs.forEach(input => view.handleKey!(press(input))),
        screen: () => view.render!(host.size()).map(stripSgr),
      }
    },
  }
}
