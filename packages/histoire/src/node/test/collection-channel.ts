import type { HistoireProjectTestCollectionResult } from '@histoire/protocol'
import type { Plugin } from 'vite'
import { getHistoireTargetKey, validateProjectTestCollection } from '@histoire/protocol'
import { debugVitestBrowser } from '../util/browser-debug.js'
import { readRequestBody } from '../util/http-body.js'

/** Private endpoint lives only on the owned browser collection server. */
export const TEST_COLLECTION_ENDPOINT = '/__histoire_test_collect__'

/** Admit each completed variant once, bounded by exact operation inventory. */
export function createTestCollectionChannel(execution: HistoireProjectTestCollectionResult['execution'], targets: HistoireProjectTestCollectionResult['variants'][number]['target'][], onProgress?: (result: HistoireProjectTestCollectionResult) => void) {
  const admitted = new Set(targets.map(getHistoireTargetKey))
  const results = new Map<string, HistoireProjectTestCollectionResult['variants'][number]>()
  const plugin: Plugin = {
    name: 'histoire-test-collection-progress',
    /** Results follow per-variant mount cleanup, before whole-browser teardown. */
    configureServer(server) {
      server.middlewares.use(TEST_COLLECTION_ENDPOINT, async (request, response) => {
        try {
          if (request.method !== 'POST') throw new Error('Invalid collection method')
          const input = JSON.parse(await readRequestBody(request))
          if (input.token !== execution.runId) throw new Error('Retired collection operation')
          const result = { execution, variants: [input.entry] }
          validateProjectTestCollection(result)
          const key = getHistoireTargetKey(input.entry.target)
          if (!admitted.has(key) || results.has(key)) throw new Error('Invalid collection target')
          results.set(key, input.entry)
          debugVitestBrowser('collection:target', { runId: execution.runId, target: input.entry.target, duration: input.duration, completed: results.size, total: admitted.size })
          onProgress?.(result)
          response.statusCode = 204
        }
        catch { response.statusCode = 400 }
        response.end()
      })
    },
  }
  return { plugin, results }
}
