import type { HistoireSession, HistoireSessionOptions } from './types.js'
import { mountRemoteSurface } from './mounts/iframe.js'
import { createHistoireSessionWithAdapters } from './session/controller.js'
import { connectRemoteSource } from './transport/connection.js'

export type * from './types.js'
export { HistoireSdkError } from '@histoire/protocol'
/** Construct without browser effects; connection and mounting stay explicit. */
export function createHistoireSession(options: HistoireSessionOptions): HistoireSession {
  return createHistoireSessionWithAdapters(options, {
    connect: connectRemoteSource,
    mount: mountRemoteSurface,
    storage: () => {
      try {
        return window.localStorage
      }
      catch {
        return undefined
      }
    },
  })
}
