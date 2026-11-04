import type { DiagnosticsDto } from '@histoire/cli/protocol/diagnostics'
import type { UiMcpSnapshot } from '@histoire/shared'
import type { CatalogSnapshot } from '../../runtime/catalog/types.js'
import type { TerminalHandlerContext } from '../../runtime/terminal/registry.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { setMcpSnapshotSource } from '../../runtime/terminal/diagnostics/mcp.js'
import { diagnosticsHandlers } from '../../runtime/terminal/handlers/diagnostics.js'
import { setSessionMcp } from '../../runtime/terminal/session-info.js'

/** Collection result with issues; the catalog already redacts, the projection must still strip controls. */
function snapshot(issues: number): CatalogSnapshot {
  const diagnostics = Array.from({ length: issues }, (_, index) => ({ code: 'COLLECTION_FAILED', message: `\u001B[31mfailed ${index}\u001B[0m`, filePath: `src/s${index}.story.vue` }))
  return { outcome: issues ? 'partial' : 'success', diagnostics, diagnosticsTruncated: false, stories: [{ variants: [{}, {}] }, { variants: [{}] }] } as unknown as CatalogSnapshot
}

/** Runs the real handler against a context holding a catalog snapshot. */
async function runHandler(current: CatalogSnapshot | undefined, failCatalog = false): Promise<DiagnosticsDto> {
  const catalog = failCatalog
    ? { get current(): never {
        throw new Error('catalog gone')
      } }
    : { current }
  return await diagnosticsHandlers[0].handle({}, { catalog } as unknown as TerminalHandlerContext) as DiagnosticsDto
}

function mcpSnapshot(overrides: Partial<UiMcpSnapshot> = {}): UiMcpSnapshot {
  return {
    status: 'enabled',
    endpoint: 'http://127.0.0.1:7777/mcp',
    clients: [{ id: 'c1', name: 'Claude\u001B[2J Code', transport: 'http', connectedAt: '', lastSeenAt: '' }, { id: 'c2', name: 'Cursor', transport: 'stdio', connectedAt: '', lastSeenAt: '' }],
    operations: [
      { id: 'o1', clientId: 'c1', tool: 'run', state: 'running', startedAt: '' },
      { id: 'o2', clientId: 'c1', tool: 'run', state: 'done', startedAt: '' },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  setMcpSnapshotSource(() => undefined)
  setSessionMcp({ enabled: false })
})

describe('diagnostics.get', () => {
  it('projects collection issues, bounded and clean, and the safe MCP summary', async () => {
    setSessionMcp({ enabled: true, url: 'http://127.0.0.1:7777/mcp', tokenRequired: true })
    setMcpSnapshotSource(() => mcpSnapshot())
    const result = await runHandler(snapshot(30))
    expect(result.collection).toMatchObject({ outcome: 'partial', stories: 2, variants: 3, issues: 30 })
    expect(result.collection!.items).toHaveLength(20)
    expect(result.collection!.items[0]).toEqual({ code: 'COLLECTION_FAILED', message: 'failed 0', file: 'src/s0.story.vue' })
    expect(result.mcp).toEqual({
      status: 'enabled',
      endpoint: 'http://127.0.0.1:7777/mcp',
      tokenRequired: true,
      clients: [{ name: 'Claude Code', transport: 'http' }, { name: 'Cursor', transport: 'stdio' }],
      clientsOmitted: 0,
      activeOperations: 1,
    })
    // Nothing but the summary leaves: no ids, tools, timestamps.
    expect(JSON.stringify(result)).not.toMatch(/c1|"tool"|connectedAt/)
  })

  it('reports disabled MCP from the actual runtime and keeps the other section when one fails', async () => {
    setSessionMcp({ enabled: false })
    expect((await runHandler(undefined)).mcp).toMatchObject({ status: 'disabled', clients: [] })
    expect((await runHandler(undefined)).collection).toBeUndefined()

    setMcpSnapshotSource(() => {
      throw new Error('snapshot unavailable')
    })
    const partial = await runHandler(snapshot(1), false)
    expect(partial.collection?.issues).toBe(1)
    expect(partial.mcp).toBeUndefined()
    expect(partial.problems).toEqual({ mcp: 'snapshot unavailable' })

    const catalogDown = await runHandler(undefined, true)
    expect(catalogDown.problems.collection).toBe('catalog gone')
  })
})
