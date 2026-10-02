import type { ProjectRuntimeHandle } from '../../runtime/types.js'
import { createProjectCatalog } from './catalog.js'
import { CatalogContentChangedError } from './content-index.js'

/** Connects completed dev collection batches to one generation-owned immutable catalog. */
export function attachProjectCatalog(runtime: ProjectRuntimeHandle, options: { projectId: string, secret?: string }) {
  let disposed = false
  const catalog = createProjectCatalog({ ...options, epoch: runtime.epoch, root: runtime.context.root, isActive: () => !disposed && runtime.isActive() })
  let publication: Promise<unknown> = Promise.resolve()
  /** Serializes fallback startup publication with awaited collector observations. */
  function publish(outcomes = runtime.collectionOutcomes) {
    publication = publication.catch(() => {}).then(async () => {
      if (disposed || !runtime.isActive()) return
      try {
        await catalog.publish(runtime.context, outcomes)
      }
      catch (error) {
        if (!(error instanceof CatalogContentChangedError)) throw error
        // A watcher event already queues the changed input. Keep the prior
        // snapshot readable, block admission, and let that batch retry.
        catalog.markUpdating()
      }
    })
    return publication.then(() => {})
  }
  const off = runtime.onCollection(async (event) => {
    if (disposed || !runtime.isActive()) return
    if (event.phase === 'started') catalog.markUpdating()
    if (event.phase === 'completed') await publish(event.outcomes)
  })
  const ready = runtime.ready.then(async () => {
    if (!catalog.current) await publish()
  })
  void ready.catch(() => {})
  return {
    catalog,
    ready,
    /** Drops lifecycle observer immediately; queued hashing cannot publish after disposal. */
    close() {
      disposed = true
      off()
    },
  }
}
