import { createClientId } from '../../util/dev-event-api.js'

/** Opaque per-replica request IDs stay bounded independently of arbitrary cell keys. */
export function createCanvasPropsRequestId(): () => string {
  const owner = createClientId()
  let counter = 0
  return () => `canvas-props:${owner}:${++counter}`
}
