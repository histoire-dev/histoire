import type { Connect } from 'vite'
import type { HistoireDevOptions } from '../../api/types.js'
import type { createDevHosting } from './dev.js'
import { createServer } from 'node:http'
import { createDevHosting as createHosting } from './dev.js'
import { closeOwnedServer, listenOwnedServer } from './listener.js'

/** Uses the same Vite middleware lifecycle with an explicitly owned HTTP listener. */
export function createManagedHosting(options: Omit<Parameters<typeof createDevHosting>[0], 'middleware' | 'getOrigin' | 'onGeneration' | 'closeListener'> & HistoireDevOptions) {
  let middleware: Connect.NextHandleFunction
  let origin = ''
  let acquiredResolve: () => void
  let acquiredReject: (error: unknown) => void
  const acquired = new Promise<void>((resolve, reject) => {
    acquiredResolve = resolve
    acquiredReject = reject
  })
  const server = createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404
      response.end('Not found')
    })
  })
  const hosting = createHosting({ ...options, middleware: { httpServer: server }, getOrigin: () => origin, async onGeneration(runtime) {
    if (!server.listening) {
      const config = runtime.server.config.server
      origin = await listenOwnedServer(server, options.port ?? config.port ?? 6006, options.host ?? config.host, config.strictPort ?? false)
    }
    runtime.server.resolvedUrls = { local: [new URL(runtime.server.config.base, origin).href], network: [] }
    acquiredResolve()
    if (options.open ?? runtime.server.config.server.open) runtime.server.openBrowser()
  }, closeListener: () => closeOwnedServer(server) })
  middleware = hosting.handle.middleware
  void hosting.handle.ready.catch(acquiredReject)
  return { handle: hosting.handle, controller: hosting.controller, execution: hosting.execution, get catalog() {
    return hosting.catalog
  }, acquired }
}
