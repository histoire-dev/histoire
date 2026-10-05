import type { NodeExecutionValue } from '../../deploy/execution.js'
import type { ExecutionTask } from '../../runtime/execution-types.js'
import type { McpOperations } from '../operations/store.js'
import type { McpExecutionCapture, McpOperationOutput } from '../operations/types.js'
import type { McpToolInput } from '../protocol/tool-schema.js'
import type { LaunchPreviewBrowser } from './dependencies.js'
import { mergeHistoireTestSummaries } from '@histoire/shared'
import { PreviewError } from '../../runtime/browser/errors.js'
import { ExecutionError } from '../../runtime/execution-types.js'
import { sanitizeMcpTestSummary } from '../operations/test-results.js'
import { McpDomainError } from '../protocol/errors.js'
import { mcpToolInputSchemas } from '../protocol/tool-schema.js'
import { runCompiledPreviewTests } from './preview-client.js'
import { createPreviewSession } from './session.js'

/** Compiled test task owns only fresh browser resources acquired inside run. */
export function createCompiledPreviewTestTask(input: McpToolInput<'histoire_run_tests'>, capture: McpExecutionCapture<NodeExecutionValue>, launch?: LaunchPreviewBrowser, secret?: string): ExecutionTask<McpOperationOutput> {
  const { artifact, catalog, host, origin } = capture.value
  const manifest = artifact.manifest
  const selected = catalog.getStory(input.storyId, capture.revision)
  const variants = input.variantId === undefined ? selected.story.variants : [catalog.getTarget(input.storyId, input.variantId, capture.revision).variant]
  let session: ReturnType<typeof createPreviewSession> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  /** Lane retains ownership until current browser teardown is confirmed. */
  async function cleanup() {
    clearTimeout(timer)
    await session?.close()
  }
  return {
    async run(externalSignal) {
      if (!manifest.testRuntimeIncluded) throw new McpDomainError('CAPABILITY_UNAVAILABLE', 'Artifact does not include embedded test runtime')
      const deadline = new AbortController()
      const signal = AbortSignal.any([externalSignal, deadline.signal])
      const until = Date.now() + manifest.timeouts.run
      timer = setTimeout(() => {
        timedOut = true
        deadline.abort()
      }, manifest.timeouts.run)
      let summary = mergeHistoireTestSummaries([])
      try {
        for (const variant of variants) {
          signal.throwIfAborted()
          if (!capture.isActive()) throw new McpDomainError('PROJECT_CLOSED', 'Deployed project is closing')
          catalog.getTarget(input.storyId, variant.id, capture.revision)
          session = createPreviewSession({ root: artifact.root, host, launch, timeoutMs: Math.max(1, until - Date.now()), target: {
            origin,
            storyId: input.storyId,
            variantId: variant.id,
            epoch: capture.epoch,
            width: 1280,
            height: 800,
            colorScheme: manifest.defaultColorScheme === 'auto' ? undefined : manifest.defaultColorScheme,
            backgroundColor: manifest.backgroundColor,
            textDirection: manifest.textDirection ?? 'ltr',
            globals: manifest.globals ?? {},
            isActive: capture.isActive,
          } })
          try {
            const ready = await session.open(signal)
            const value = await runCompiledPreviewTests({ session, ready, target: { storyId: input.storyId, variantId: variant.id, epoch: capture.epoch }, collectTimeoutMs: manifest.timeouts.storyCollect, sanitize: { root: artifact.root, secret } })
            summary = sanitizeMcpTestSummary(mergeHistoireTestSummaries([summary, value]), { root: artifact.root, secret })
          }
          finally { await session.close() }
        }
        return { result: { storyId: input.storyId, ...(input.variantId === undefined ? {} : { variantId: input.variantId }), engine: 'built-preview', summary, truncated: false } }
      }
      catch (error) {
        if (error instanceof ExecutionError) throw error
        if (timedOut || session?.timedOut) throw new McpDomainError('TIMEOUT', 'Compiled tests exceeded recorded run deadline', true)
        if (externalSignal.aborted) throw new McpDomainError('CANCELLED', 'Compiled test operation cancelled')
        if (error instanceof McpDomainError || error instanceof PreviewError) throw error
        throw new McpDomainError('PREVIEW_NOT_READY', 'Compiled preview test operation failed', true)
      }
      finally { clearTimeout(timer) }
    },
    cleanup,
  }
}

/** Production assembly only: no source, config, Vite or Node Vitest dependency. */
export function registerNodeTestExecutor(operations: McpOperations<NodeExecutionValue>, launch?: LaunchPreviewBrowser, secret?: string) {
  operations.registerExecutor('tests', (input, capture) => createCompiledPreviewTestTask(mcpToolInputSchemas.histoire_run_tests.parse(input), capture, launch, secret))
}
