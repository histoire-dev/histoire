import type { HttpServer } from 'vite'
import { HistoireSdkError } from '@histoire/protocol'
import { normalizeHostingBase } from './routes.js'

/** Caller server identity scopes active project mounts without retaining servers. */
const mounts = new WeakMap<HttpServer, Set<string>>()

/** Reserves a base synchronously before any watcher, listener or Vite acquisition. */
export function reserveHostBase(server: HttpServer, value: string): () => void {
  const base = normalizeHostingBase(value)
  let active = mounts.get(server)
  if (!active) mounts.set(server, active = new Set())
  if ([...active].some(current => base.startsWith(current) || current.startsWith(base))) throw new HistoireSdkError('RUNTIME_IN_USE', `Histoire base already mounted or overlaps an active mount: ${base}`)
  active.add(base)
  let released = false
  return () => {
    if (released) return
    released = true
    active.delete(base)
    if (!active.size) mounts.delete(server)
  }
}
