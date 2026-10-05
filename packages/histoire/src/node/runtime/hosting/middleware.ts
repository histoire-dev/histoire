import type { HistoireMiddlewareOptions } from '../../api/types.js'
import type { createDevHosting } from './dev.js'
import { createDevHosting as createHosting } from './dev.js'
import { assertHostingServer, waitForHostingListener } from './listener.js'
import { reserveHostBase } from './mounts.js'
import { normalizeHostingBase, normalizeHostingOrigin } from './routes.js'

/** Reserves caller ownership and returns before waiting for its listener. */
export function createMiddlewareHosting(options: Omit<Parameters<typeof createDevHosting>[0], 'middleware' | 'getOrigin' | 'beforeStart'> & HistoireMiddlewareOptions) {
  assertHostingServer(options.httpServer)
  const base = normalizeHostingBase(options.base)
  const origin = normalizeHostingOrigin(options.publicOrigin)
  const release = reserveHostBase(options.httpServer, base)
  try {
    return createHosting({ ...options, middleware: { httpServer: options.httpServer, base, publicOrigin: origin }, getOrigin: () => origin, beforeStart: signal => waitForHostingListener(options.httpServer, signal), onClose() {
      release()
      options.onClose()
    } })
  }
  catch (error) {
    release()
    throw error
  }
}
