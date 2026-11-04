import type { DiagnosticsDto } from '../terminal/protocol/diagnostics.js'
import { describe, expect, it } from 'vitest'
import { createRequestsView } from '../terminal/views/requests.js'
import { createSessionView } from '../terminal/views/session.js'
import { settleTimers } from './utils/flush.js'
import { readyGeneration } from './utils/terminal/progress.js'
import { createScriptedBridge, createViewHostRig } from './utils/terminal/view-host.js'

describe('diagnostics in the session screen and panel', () => {
  const dto = (overrides: Partial<DiagnosticsDto> = {}): DiagnosticsDto => ({
    problems: {},
    collection: { outcome: 'partial', stories: 2, variants: 3, issues: 2, truncated: false, items: [{ code: 'COLLECTION_FAILED', message: 'failed 0', file: 'src/a.story.vue' }] },
    mcp: { status: 'enabled', endpoint: 'http://127.0.0.1:7777/mcp', tokenRequired: true, clients: [{ name: 'Cursor', transport: 'stdio' }], clientsOmitted: 0, activeOperations: 1 },
    ...overrides,
  })

  /** Session screen over a rig whose runtime answers `diagnostics.get` with the current `reply`. */
  function setup(reply: () => unknown) {
    const rig = createViewHostRig({ rows: 30, columns: 160, bridge: createScriptedBridge(operation => operation === 'diagnostics.get' ? reply() : { histoire: '1', node: 'n', vite: 'v', root: '/r', mcp: { enabled: false } }) })
    rig.open(createRequestsView)
    readyGeneration(rig.progress, 'g1')
    return rig
  }

  it('shows collection issues, MCP clients and request counts, plus compact panel counts', async () => {
    const rig = setup(() => dto())
    rig.host.requests.onEvent({ phase: 'end', key: 1, method: 'GET', pathname: '/x', status: 503, outcome: 'failed', durationMs: 3 })
    await settleTimers()
    const text = rig.open(createSessionView).screen().join('\n')
    expect(text).toContain('Collection  partial · 2 issues')
    expect(text).toContain('COLLECTION_FAILED src/a.story.vue: failed 0')
    expect(text).toContain('… 1 more issues')
    expect(text).toContain('MCP         http://127.0.0.1:7777/mcp · bearer token required · 1 client (Cursor) · 1 active')
    expect(text).toContain('Requests    1 retained · 1 failed')
    expect(rig.panelSegments()).toEqual(['2 issues · 1 failed request'])
  })

  it('shows a failed section on its own and a failed retrieval without hiding requests or the server', async () => {
    let fail = false
    const rig = setup(() => {
      if (fail) throw new Error('timed out')
      return dto({ collection: undefined, problems: { collection: 'catalog gone' } })
    })
    await settleTimers()
    let text = rig.open(createSessionView).screen().join('\n')
    expect(text).toContain('Collection  unavailable: catalog gone')
    expect(text).toContain('MCP         http://127.0.0.1:7777/mcp')

    // New generation whose read fails: scoped failure, request summary still present.
    fail = true
    rig.host.requests.onEvent({ phase: 'end', key: 1, method: 'GET', pathname: '/x', status: 200, outcome: 'completed', durationMs: 3 })
    rig.progress.onStatus({ status: 'restarting' })
    rig.progress.onRuntimeStart({ generation: 'g2', fresh: false })
    rig.progress.onStatus({ status: 'ready' })
    await settleTimers()
    text = rig.open(createSessionView).screen().join('\n')
    expect(text).toContain('Diagnostics unavailable: timed out')
    expect(text).not.toContain('catalog gone')
    expect(text).toContain('Requests    1 retained')
    expect(rig.panelSegments()).toEqual([])
  })
})
