import type { HistoireTestCollectionResult, HistoireTestRunSummary } from '@histoire/protocol'
import type { HistoireRequestCapture } from '@histoire/sdk/internal'
import type { createRuntimeRequests } from './runtime-requests.js'
import { COLLECT_TESTS, HistoireSdkError, RUN_TESTS } from '@histoire/protocol'

/** Existing preview runner has no cooperative body abort; cancellation retires actual document. */
export function createEmbedPreviewTests(requests: ReturnType<typeof createRuntimeRequests>, retire: (capture: HistoireRequestCapture) => void) {
  return {
    /** Selection/document and runtime deadlines remain owned by existing sandbox adapter. */
    async request(command: 'tests.collect' | 'tests.run', capture: HistoireRequestCapture): Promise<HistoireTestCollectionResult | HistoireTestRunSummary> {
      capture.signal.throwIfAborted()
      const abort = () => retire(capture)
      capture.signal.addEventListener('abort', abort, { once: true })
      try {
        const result = await requests.request(command === 'tests.collect' ? COLLECT_TESTS : RUN_TESTS, { command }, capture)
        if (command === 'tests.collect' && result.error) throw new HistoireSdkError('COLLECTION_FAILED', result.error.message ?? String(result.error))
        return result
      }
      finally { capture.signal.removeEventListener('abort', abort) }
    },
  }
}
