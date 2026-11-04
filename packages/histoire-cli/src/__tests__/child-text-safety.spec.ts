/* eslint-disable no-control-regex -- asserting that terminal controls are gone */
import { expect, it } from 'vitest'
import { buildDiagnosticsLines } from '../terminal/diagnostics/lines.js'
import { buildSessionLines } from '../terminal/info/lines.js'
import { describeProgress, describeRestartCause } from '../terminal/progress/format.js'
import { createProgressState } from '../terminal/progress/state.js'
import { createRequestHistory } from '../terminal/requests/history.js'

/** Hostile text: cursor movement, an OSC title, a bidi override and a line break. */
const HOSTILE = 'a\u001B[2J\u001B]0;pwn\u0007b‮c\nd\re'
const HOSTILE_CLEAN = 'abc de'

it('makes child progress and restart text terminal-safe, including the token', () => {
  const state = createProgressState({ secrets: ['tok-123'] })
  state.onStatus({ status: 'starting' })
  state.onRuntimeStart({ generation: 'g1', fresh: false })
  state.onProgress('g1', { phase: 'plugins', status: 'started', label: HOSTILE })
  state.onProgress('g1', { phase: 'plugins', status: 'failed', error: `${HOSTILE} tok-123` })
  const text = describeProgress(state.snapshot())
  expect(text).toContain(`(${HOSTILE_CLEAN})`)
  expect(text).toContain('[credential]')
  expect(text).not.toMatch(/[\u001B‮\r]/)
  state.onRestart({ kind: 'exit', source: HOSTILE, fresh: false })
  state.onStatus({ status: 'restarting' })
  expect(state.snapshot().cause?.source).toBe(HOSTILE_CLEAN)
  expect(describeRestartCause({ kind: 'config', source: `${HOSTILE} tok-123`, fresh: false }, ['tok-123'])).toBe(`Config changed, restarting (${HOSTILE_CLEAN} [credential])...`)
})

it('makes child session and diagnostics fields terminal-safe', () => {
  const session = buildSessionLines({
    snapshot: createProgressState().snapshot(),
    uptimeMs: 0,
    info: { histoire: HOSTILE, node: '20', vite: '6', root: HOSTILE, configFile: HOSTILE, mcp: { enabled: true, url: HOSTILE } },
  }).join('\n')
  const diagnostics = buildDiagnosticsLines({
    requests: createRequestHistory(),
    diagnostics: {
      collection: { outcome: 'failed', stories: 0, variants: 0, issues: 1, truncated: false, items: [{ code: HOSTILE, file: HOSTILE, message: HOSTILE }] },
      mcp: { status: 'enabled', endpoint: HOSTILE, clients: [{ name: HOSTILE, transport: 'http' }], clientsOmitted: 0, activeOperations: 0 },
      problems: {},
    },
  }).join('\n')
  for (const text of [session, diagnostics]) {
    expect(text).toContain(HOSTILE_CLEAN)
    expect(text).not.toMatch(/[\u001B‮\r]/)
  }
})
