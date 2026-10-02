import type { HistoireTestRunSummary } from '@histoire/shared'
import type { PreviewTestCommand } from './preview-test-script.js'
import type { createPreviewSession } from './session.js'
import { randomUUID } from 'node:crypto'
import { sanitizeMcpTestSummary } from '../operations/test-results.js'
import { McpDomainError } from '../protocol/errors.js'
import { mcpTestSummarySchema } from '../protocol/test-schema.js'

/** Exact ready document returned by shared screenshot/test session. */
type ReadyPreview = Awaited<ReturnType<ReturnType<typeof createPreviewSession>['open']>>

/** Fixed protocol command; never repeats effect after timeout or navigation. */
async function request(ready: ReadyPreview, command: PreviewTestCommand, timeout: number): Promise<any> {
  const dispatched = await ready.page.evaluate(command => (window as any).__HST_MCP_PREVIEW__?.tests?.request(command) === true, command)
  if (!dispatched) throw new McpDomainError('PREVIEW_NOT_READY', 'Compiled preview lost its document authority')
  try {
    await ready.page.waitForFunction(command => (window as any).__HST_MCP_PREVIEW__?.tests?.settled(command), command, { timeout })
  }
  catch (error) {
    if ((error as Error).name === 'TimeoutError') throw new McpDomainError('TIMEOUT', 'Compiled test response exceeded its recorded deadline', true)
    throw error
  }
  const result = await ready.page.evaluate(command => (window as any).__HST_MCP_PREVIEW__?.tests?.take(command), command)
  if (!result) throw new McpDomainError('PREVIEW_NOT_READY', 'Compiled preview changed during test execution')
  if (result.oversized) throw new McpDomainError('RESULT_TOO_LARGE', 'Compiled preview result exceeds 4 MiB limit')
  if (result.malformed) throw new McpDomainError('PREVIEW_NOT_READY', 'Compiled preview returned malformed test results')
  return result
}

/** Collect and run existing embedded session against one exact ready document. */
export async function runCompiledPreviewTests(options: {
  /** Owned session and its finite remaining deadline. */
  session: ReturnType<typeof createPreviewSession>
  /** Ready live document; stale navigation rejects without repeat. */
  ready: ReadyPreview
  /** Captured authority independent of delimiter-based compatibility key. */
  target: { storyId: string, variantId: string, epoch: string }
  /** Existing recorded collection deadline, bounded by whole job. */
  collectTimeoutMs: number
  /** Private scrub inputs, never transmitted to preview. */
  sanitize: { root: string, secret?: string }
}): Promise<HistoireTestRunSummary> {
  const { session, ready, target } = options
  const identity = { ...target, nonce: ready.nonce, documentId: ready.documentId }
  const collection = await request(ready, { ...identity, kind: 'collect', id: randomUUID() }, Math.min(session.remaining(), options.collectTimeoutMs))
  if (!Number.isSafeInteger(collection.count) || collection.count < 0) throw new McpDomainError('COLLECTION_FAILED', 'Compiled preview could not collect test definitions')
  if (collection.error) throw new McpDomainError('COLLECTION_FAILED', 'Compiled preview test collection failed')
  const result = await request(ready, { ...identity, kind: 'run', id: randomUUID() }, session.remaining())
  // The existing embedded runner owns modifiers, hooks, assertions and deadlines.
  // Reuse common sanitizer before strict wire validation to discard raw causes.
  let summary: HistoireTestRunSummary
  try {
    summary = mcpTestSummarySchema.parse(sanitizeMcpTestSummary(result.summary, options.sanitize))
  }
  catch (error) {
    if (error instanceof McpDomainError) throw error
    throw new McpDomainError('PREVIEW_NOT_READY', 'Compiled preview returned malformed test summary')
  }
  if (summary.tests.some(test => test.storyId !== target.storyId || test.variantId !== target.variantId)) throw new McpDomainError('PREVIEW_NOT_READY', 'Compiled preview returned another test target')
  return summary
}
