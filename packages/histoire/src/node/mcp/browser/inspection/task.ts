import type { PreviewSessionOptions } from '../../../runtime/browser/session.js'
import type { ExecutionTask } from '../../../runtime/execution-types.js'
import type { McpOperationOutput } from '../../operations/types.js'
import type { MCP_INSPECTION_TOOLS, McpInspectionInput } from '../../protocol/inspection-schema.js'
import { randomUUID } from 'node:crypto'
import { RUNTIME_REQUEST, RUNTIME_RESULT } from '@histoire/shared'
import { PreviewError } from '../../../runtime/browser/errors.js'
import { createPreviewSession } from '../../../runtime/browser/session.js'
import { McpDomainError } from '../../protocol/errors.js'
import { mcpInspectionInputSchemas } from '../../protocol/inspection-schema.js'
import { createInspectionDiagnostics } from './diagnostics.js'
import { inspectDomDocument } from './dom.js'
import { boundInspectionResult } from './result.js'
import { requestPreviewState } from './state.js'

/** Fixed isolated read; queue owns acquisition, authority and confirmed cleanup. */
export function createInspectionTask(kind: keyof typeof MCP_INSPECTION_TOOLS, input: McpInspectionInput, options: PreviewSessionOptions, sanitize = { root: options.root } as { root: string, secret?: string }): ExecutionTask<McpOperationOutput> {
  const diagnostics = createInspectionDiagnostics(sanitize)
  const session = createPreviewSession({ ...options, target: { ...options.target, globals: options.target.globals && { ...options.target.globals } }, deterministicCapture: true, ...(kind === 'runtime-diagnostics' ? { observePage: diagnostics.attach } : {}) })
  const base = { storyId: input.storyId, variantId: input.variantId, viewport: { width: input.width, height: input.height } }
  return {
    /** Inspect only current owned document and detach bounded results before teardown. */
    async run(signal) {
      try {
        let ready: Awaited<ReturnType<typeof session.open>>
        try {
          ready = await session.open(signal)
        }
        catch (error) {
          const observed = diagnostics.snapshot()
          if (kind === 'runtime-diagnostics' && !signal.aborted && observed.entries.length && error instanceof PreviewError && ['PREVIEW_NOT_READY', 'TIMEOUT'].includes(error.code)) {
            return { result: boundInspectionResult({ ...base, inspection: 'diagnostics', previewReady: false, readinessError: error.message, ...observed }) }
          }
          throw error
        }
        let result: McpOperationOutput['result']
        if (kind === 'inspect-variant') {
          const projection = await ready.page.evaluate(requestPreviewState, { id: randomUUID(), nonce: ready.nonce, epoch: options.target.epoch, documentId: ready.documentId, storyId: input.storyId, variantId: input.variantId, requestType: RUNTIME_REQUEST, resultType: RUNTIME_RESULT, timeoutMs: session.remaining() })
          result = { ...base, inspection: 'variant', ...projection }
        }
        else if (kind === 'runtime-diagnostics') {
          const request = mcpInspectionInputSchemas.histoire_get_runtime_diagnostics.parse(input)
          if (request.observationMs) await ready.page.waitForTimeout(Math.min(request.observationMs, session.remaining()))
          result = { ...base, inspection: 'diagnostics', previewReady: true, ...diagnostics.snapshot() }
        }
        else {
          const selector = 'selector' in input ? input.selector : 'body'
          const valid = await ready.frame.evaluate((selector) => {
            try {
              document.querySelector(selector)
              return true
            }
            catch { return false }
          }, selector)
          if (!valid) throw new McpDomainError('INVALID_SELECTOR', 'Invalid inspection CSS selector')
          if (kind === 'inspect-dom') {
            const request = mcpInspectionInputSchemas.histoire_inspect_dom.parse(input)
            result = { ...base, inspection: 'dom', ...await ready.frame.evaluate(inspectDomDocument, { selector, maxNodes: request.maxNodes, maxDepth: request.maxDepth }) }
          }
          else {
            const request = mcpInspectionInputSchemas.histoire_inspect_accessibility.parse(input)
            const locator = ready.frame.locator(`css=${selector}`).first()
            const matched = await locator.count() > 0
            if (typeof locator.ariaSnapshot !== 'function') throw new McpDomainError('CAPABILITY_UNAVAILABLE', 'Accessibility inspection requires Playwright with locator.ariaSnapshot')
            const full = matched ? await locator.ariaSnapshot({ timeout: session.remaining() }) : ''
            const snapshot = full.slice(0, request.maxCharacters)
            result = { ...base, inspection: 'accessibility', matched, snapshot, totalCharacters: full.length, truncated: snapshot.length < full.length }
          }
        }
        if (!options.target.isActive() || !await session.isDocumentReady(ready.documentId)) throw new McpDomainError('PREVIEW_NOT_READY', 'Inspection document changed before completion', true)
        if (session.timedOut) throw new PreviewError('TIMEOUT', 'Inspection exceeded its preview deadline', true)
        if (signal.aborted) throw new PreviewError('CANCELLED', 'Inspection operation cancelled')
        return { result: boundInspectionResult(result as Parameters<typeof boundInspectionResult>[0]) }
      }
      catch (error) {
        if (signal.aborted) throw new PreviewError('CANCELLED', 'Inspection operation cancelled')
        if (kind === 'runtime-diagnostics' && (session.pageFailed || session.timedOut)) {
          const observed = diagnostics.snapshot()
          if (observed.entries.length) return { result: boundInspectionResult({ ...base, inspection: 'diagnostics', previewReady: false, readinessError: session.pageFailed ? 'Preview page failed' : 'Preview exceeded its deadline', ...observed }) }
        }
        if (session.timedOut) throw new PreviewError('TIMEOUT', 'Inspection exceeded its preview deadline', true)
        if (error instanceof McpDomainError || error instanceof PreviewError) throw error
        throw new PreviewError('PREVIEW_NOT_READY', 'Preview could not be inspected', true)
      }
    },
    /** Listener ownership ends before confirmed browser cleanup releases the lane. */
    async cleanup() {
      diagnostics.close()
      await session.close()
    },
  }
}
