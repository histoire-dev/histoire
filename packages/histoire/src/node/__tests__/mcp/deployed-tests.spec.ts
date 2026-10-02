import type { NodeExecutionValue } from '../../deploy/execution.js'
import type { McpExecutionCapture } from '../../mcp/operations/types.js'
import { createHistoireTestSummary } from '@histoire/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readNodeArtifact } from '../../deploy/artifact-reader.js'
import { createNodeCatalog } from '../../deploy/catalog.js'
import { runCompiledPreviewTests } from '../../mcp/browser/preview-client.js'
import { createPreviewHostRegistry } from '../../mcp/browser/preview-host.js'
import { createCompiledPreviewTestTask } from '../../mcp/browser/preview-tests.js'
import { createPreviewSession } from '../../mcp/browser/session.js'
import { McpDomainError } from '../../mcp/protocol/errors.js'
import { mcpToolInputSchemas } from '../../mcp/protocol/tool-schema.js'
import { ExecutionError } from '../../runtime/execution-types.js'
import { createMcpArtifactFixture } from '../utils/mcp/artifact.js'
import { OPERATION_EPOCH } from '../utils/mcp/operations.js'

vi.mock('../../mcp/browser/session.js', () => ({ createPreviewSession: vi.fn() }))
vi.mock('../../mcp/browser/preview-client.js', () => ({ runCompiledPreviewTests: vi.fn() }))

const fixtures: Array<Awaited<ReturnType<typeof createMcpArtifactFixture>>> = []
const sessions: Array<{ open: ReturnType<typeof vi.fn>, close: ReturnType<typeof vi.fn> }> = []

/** Immutable artifact authority reused rather than a parallel catalog stub. */
async function capture(): Promise<McpExecutionCapture<NodeExecutionValue>> {
  const fixture = await createMcpArtifactFixture()
  fixtures.push(fixture)
  const artifact = await readNodeArtifact(fixture.root)
  artifact.manifest.testRuntimeIncluded = true
  artifact.manifest.stories[0].story.variants = ['first', 'second'].map(id => ({ ...artifact.manifest.stories[0].story.variants[0], id }))
  const revision = `${OPERATION_EPOCH}:1`
  return { projectId: 'project', epoch: OPERATION_EPOCH, revision, value: { artifact, catalog: createNodeCatalog(artifact.manifest, 'project', revision), host: createPreviewHostRegistry({ base: '/' }), origin: 'http://localhost:6006' }, isActive: () => true, validate: () => {} }
}

beforeEach(() => {
  sessions.length = 0
  vi.resetAllMocks()
  vi.mocked(createPreviewSession).mockImplementation(() => {
    const value = { open: vi.fn(async () => ({})), close: vi.fn(async () => {}), timedOut: false }
    sessions.push(value)
    return value as any
  })
  vi.mocked(runCompiledPreviewTests).mockImplementation(async ({ target }) => createHistoireTestSummary(target.storyId, target.variantId, [{ name: target.variantId, state: target.variantId === 'first' ? 'passed' : 'failed', errors: [] }]))
})

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(value => value.close()))
})

describe('deployed test execution ownership', () => {
  it('runs whole story in sequential fresh sessions and retains assertion failures as completion', async () => {
    const authority = await capture()
    const storyId = authority.value.artifact.manifest.stories[0].story.id
    const task = createCompiledPreviewTestTask(mcpToolInputSchemas.histoire_run_tests.parse({ storyId, requestKey: 'whole' }), authority)
    expect(sessions).toHaveLength(0)
    const output = await task.run(new AbortController().signal)
    await task.cleanup!()
    expect(output.result).toMatchObject({ engine: 'built-preview', summary: { ok: false, total: 2, passed: 1, failed: 1 } })
    expect(sessions).toHaveLength(2)
    expect(sessions[0].close.mock.invocationCallOrder[0]).toBeLessThan(sessions[1].open.mock.invocationCallOrder[0])
    expect((output.result as any).summary.tests.map(test => test.variantId)).toEqual(['first', 'second'])
  })

  it('selects one variant and rejects artifact missing runtime before launch', async () => {
    const authority = await capture()
    const storyId = authority.value.artifact.manifest.stories[0].story.id
    const input = mcpToolInputSchemas.histoire_run_tests.parse({ storyId, variantId: 'first', requestKey: 'one' })
    const task = createCompiledPreviewTestTask(input, authority)
    const output = await task.run(new AbortController().signal)
    await task.cleanup!()
    expect(output.result).toMatchObject({ variantId: 'first', summary: { total: 1, ok: true } })
    expect(sessions).toHaveLength(1)
    authority.value.artifact.manifest.testRuntimeIncluded = false
    await expect(createCompiledPreviewTestTask(input, authority).run(new AbortController().signal)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    expect(sessions).toHaveLength(1)
  })

  it('stops after cancellation and observes current session cleanup', async () => {
    const authority = await capture()
    const controller = new AbortController()
    vi.mocked(runCompiledPreviewTests).mockImplementationOnce(async () => {
      controller.abort()
      throw new McpDomainError('CANCELLED', 'Cancelled')
    })
    const task = createCompiledPreviewTestTask(mcpToolInputSchemas.histoire_run_tests.parse({ storyId: authority.value.artifact.manifest.stories[0].story.id, requestKey: 'cancel' }), authority)
    await expect(task.run(controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' })
    await task.cleanup!()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].close).toHaveBeenCalled()
  })

  it('preserves cleanup uncertainty instead of translating it into preview failure', async () => {
    const authority = await capture()
    vi.mocked(runCompiledPreviewTests).mockImplementationOnce(async () => {
      sessions[0].close.mockRejectedValue(new ExecutionError('CLEANUP_UNCONFIRMED', 'Unknown browser ownership'))
      return createHistoireTestSummary('story', 'variant', [])
    })
    const task = createCompiledPreviewTestTask(testInput(authority), authority)
    await expect(task.run(new AbortController().signal)).rejects.toMatchObject({ code: 'CLEANUP_UNCONFIRMED' })
  })
})

/** Valid all-variant target from fixture's actual catalog. */
function testInput(authority: McpExecutionCapture<NodeExecutionValue>) {
  return mcpToolInputSchemas.histoire_run_tests.parse({ storyId: authority.value.artifact.manifest.stories[0].story.id, requestKey: 'cleanup' })
}
