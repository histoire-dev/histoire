import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer, Plugin as VitePlugin } from 'vite'
import type { BrowserCollectedStoryResult } from './types.js'
import { readRequestBody, RequestBodyTooLargeError } from '../util/http-body.js'

/** HTTP endpoint the generated browser specs post their collection results to. */
export const BROWSER_COLLECTION_ENDPOINT = '/__histoire_browser_collect__'

/**
 * Creates the HTTP channel the browser collection reports its results through.
 *
 * Results cannot come back through Vitest's own reporting: the collected story
 * data is far too large for a test name/error payload, so the generated specs
 * POST it to a middleware installed on the run's own Vite server instead.
 * Results are keyed by run token so a stale run can never leak into a new one.
 */
export function createCollectionChannel() {
  const runs = new Map<string, {
    results: Map<string, BrowserCollectedStoryResult>
    failures: Map<string, { error: string }>
  }>()

  const plugin: VitePlugin = {
    name: 'histoire-browser-collection-channel',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(BROWSER_COLLECTION_ENDPOINT, async (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const payload = JSON.parse(await readRequestBody(req)) as {
            token: string
            file: string
            result?: BrowserCollectedStoryResult
            failure?: { error: string }
          }
          const run = runs.get(payload.token) ?? createRun()
          runs.set(payload.token, run)

          if (payload.result) {
            run.results.set(payload.file, payload.result)
            run.failures.delete(payload.file)
          }
          if (payload.failure) {
            run.failures.set(payload.file, payload.failure)
          }

          res.statusCode = 204
          res.end()
        }
        catch (error) {
          // Connect does not await async handlers: a malformed body or an
          // aborted socket must fail this response only — as an unhandled
          // rejection it would be fatal, since Vitest's logger installs a
          // process-wide rejection handler that exits the process.
          console.error(error)
          res.statusCode = error instanceof RequestBodyTooLargeError ? 413 : 400
          res.end()
        }
      })
    },
  }

  return {
    plugin,
    read(token: string) {
      return runs.get(token) ?? createRun()
    },
  }
}

/** Empty result/failure maps of one collection run. */
function createRun() {
  return {
    results: new Map<string, BrowserCollectedStoryResult>(),
    failures: new Map<string, { error: string }>(),
  }
}
