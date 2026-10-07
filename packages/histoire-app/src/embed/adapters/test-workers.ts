import type { HistoireTarget, HistoireTestRunSummary } from '@histoire/protocol'
import type { HistoireRequestCapture } from '@histoire/sdk/internal'
import type { HistoireSerializedTestDefinition } from '@histoire/shared'
import { HistoireSdkError, RUN_TEST_CASE, TEST_CASE_RESULT, VARIANT_READY } from '@histoire/protocol'
import { createFailedRunSummary, mergeHistoireTestSummaries } from '@histoire/shared'

interface EmbedTestWorkersOptions {
  /** Element retaining hidden runtime documents for their complete test case. */
  container: HTMLElement
  /** Configured concurrent test case ceiling. */
  maxWorkers: number
  /** Per-case mount and execution deadline. */
  timeoutMs: number
  /** Creates the immutable sandbox URL for one exact target/document pair. */
  createUrl: (target: HistoireTarget & { variantId: string }, documentId: string) => string
  /** Mints document identities compatible with the owning embed surface. */
  createDocumentId: () => string
}

interface TestWorker {
  /** Hidden frame running exactly one definition. */
  frame: HTMLIFrameElement
  /** Parent-minted lifetime identity. */
  documentId: string
  /** Definition this document is allowed to run. */
  definition: HistoireSerializedTestDefinition
  /** Correlates the request/reply inside this document. */
  runId: string
  /** Exact source target, never inferred from a delimiter-joined key. */
  target: HistoireTarget & { variantId: string }
  /** Prevents a repeated readiness publication from starting another run. */
  started: boolean
  /** Settles and removes all resources exactly once. */
  finish: (error?: unknown, summary?: HistoireTestRunSummary) => void
}

/**
 * Schedules isolated hidden runtime documents for in-book test execution.
 *
 * A document is deliberately never reused: story modules and suite hooks can
 * retain mutable module state, so reuse would make parallel cases interfere.
 */
export function createEmbedTestWorkers(options: EmbedTestWorkersOptions) {
  let active = true
  let nextRun = 0
  let runGeneration = 0
  const workers = new Map<string, TestWorker>()

  /** Accepts only messages from the exact hidden document that owns the case. */
  function receive(event: MessageEvent) {
    if (!active || event.origin !== window.location.origin || !event.data?.__histoire) return
    const worker = workers.get(event.data.documentId)
    if (!worker || event.source !== worker.frame.contentWindow) return
    if (event.data.storyId !== worker.target.storyId || event.data.variantId !== worker.target.variantId) return

    if (event.data.type === VARIANT_READY && !worker.started) {
      worker.started = true
      worker.frame.contentWindow?.postMessage({
        __histoire: true,
        type: RUN_TEST_CASE,
        documentId: worker.documentId,
        storyId: worker.target.storyId,
        variantId: worker.target.variantId,
        runId: worker.runId,
        definition: worker.definition,
      }, window.location.origin)
      return
    }

    if (event.data.type !== TEST_CASE_RESULT || event.data.runId !== worker.runId) return
    if (event.data.definition?.id !== worker.definition.id || !event.data.summary) return
    worker.finish(undefined, event.data.summary as HistoireTestRunSummary)
  }

  window.addEventListener('message', receive)

  /** Runs one definition after its sandbox has mounted the exact target. */
  function runCase(capture: HistoireRequestCapture, definition: HistoireSerializedTestDefinition) {
    const target = capture.target
    if (!target?.storyId || !target.variantId) {
      return Promise.reject(new HistoireSdkError('PREVIEW_NOT_READY', 'Selected runtime unavailable'))
    }

    const documentId = options.createDocumentId()
    const runId = `${documentId}:test:${++nextRun}`
    const frame = options.container.ownerDocument.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.style.cssText = 'position:absolute;width:1px;height:1px;border:0;opacity:0;pointer-events:none;'

    return new Promise<HistoireTestRunSummary>((resolve, reject) => {
      let done = false
      const timer = setTimeout(() => finish(new HistoireSdkError('TIMEOUT', 'Test case runtime timed out')), options.timeoutMs)
      const abort = () => finish(new HistoireSdkError('CANCELLED', 'Test run cancelled'))

      /** Releases the iframe and listeners before settling the scheduled case. */
      function finish(error?: unknown, summary?: HistoireTestRunSummary) {
        if (done) return
        done = true
        clearTimeout(timer)
        capture.signal.removeEventListener('abort', abort)
        workers.delete(documentId)
        frame.remove()
        if (error) reject(error)
        else resolve(summary!)
      }

      const worker: TestWorker = {
        frame,
        documentId,
        definition,
        runId,
        target: target as HistoireTarget & { variantId: string },
        started: false,
        finish,
      }
      workers.set(documentId, worker)
      capture.signal.addEventListener('abort', abort, { once: true })
      if (capture.signal.aborted) {
        abort()
        return
      }
      frame.src = options.createUrl(worker.target, documentId)
      options.container.append(frame)
    })
  }

  /** Runs collection-order cases with no more than the configured live frames. */
  async function run(capture: HistoireRequestCapture, definitions: HistoireSerializedTestDefinition[]) {
    if (!definitions.length) return mergeHistoireTestSummaries([])
    const target = capture.target
    if (!target?.storyId || !target.variantId) {
      throw new HistoireSdkError('PREVIEW_NOT_READY', 'Selected runtime unavailable')
    }
    const summaries: HistoireTestRunSummary[] = []
    const workerCount = Math.max(1, Math.min(options.maxWorkers, definitions.length))
    const generation = runGeneration
    let nextDefinition = 0

    /** Prevents a retired request from scheduling more documents after navigation. */
    function assertCurrentRun() {
      capture.signal.throwIfAborted()
      if (!active || generation !== runGeneration) {
        throw new HistoireSdkError('RUNTIME_CHANGED', 'Runtime document retired')
      }
    }

    /** Claims the next case only after this worker's prior document is removed. */
    async function work() {
      while (nextDefinition < definitions.length) {
        assertCurrentRun()
        const index = nextDefinition++
        const definition = definitions[index]
        try {
          summaries[index] = await runCase(capture, definition)
        }
        catch (error) {
          assertCurrentRun()
          summaries[index] = createFailedRunSummary(target.storyId, target.variantId, error)
        }
      }
    }

    await Promise.all(Array.from({ length: workerCount }, work))
    assertCurrentRun()
    return mergeHistoireTestSummaries(summaries)
  }

  /** Stops current hidden documents while keeping the pool usable after navigation. */
  function cancel() {
    runGeneration++
    for (const worker of workers.values()) {
      worker.finish(new HistoireSdkError('RUNTIME_CHANGED', 'Runtime document retired'))
    }
    workers.clear()
  }

  return {
    run,
    cancel,
    /** Cancelling a request or closing the visible runtime tears down only its hidden documents. */
    close() {
      if (!active) return
      active = false
      window.removeEventListener('message', receive)
      cancel()
    },
  }
}
