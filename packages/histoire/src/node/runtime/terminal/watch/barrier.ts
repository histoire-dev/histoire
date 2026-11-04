import type { CollectionEvent } from '../../../server/collect.js'
import type { RuntimeCatalog } from '../../catalog/publication.js'

/** Inputs of the collection barrier. */
export interface CollectionBarrierOptions {
  /** Canonical catalog of the generation. */
  catalog: Pick<RuntimeCatalog, 'current' | 'updating'> | undefined
  /** Collection observations of the generation. */
  onCollection: (handler: (event: CollectionEvent) => void | Promise<void>) => () => void
  /** Called, synchronously and cheaply, for every collection event that matters. */
  changed: (event: CollectionEvent) => void
}

/**
 * Tells when source collection is genuinely usable. The catalog's own
 * `updating` fence is authoritative (it closes at the first announcement of a
 * batch and opens only after its publication, also when nothing changed, which
 * no catalog subscription would report); collection events only say when to
 * look again. Background revalidation of a restored catalog never closes it.
 * The handler never awaits anything, so a collector waiting on it cannot be
 * held up by a test run.
 * @param options Catalog and collection observations.
 * @returns Barrier state and its detach function.
 */
export function createCollectionBarrier(options: CollectionBarrierOptions) {
  let failure: unknown
  let failed = false
  const off = options.onCollection((event) => {
    if (!event.revalidate) {
      if (event.phase === 'failed') {
        failed = true
        failure = event.error
      }
      else if (event.phase === 'completed') {
        failed = false
        failure = undefined
      }
    }
    options.changed(event)
  })
  return {
    /** A completed catalog exists and no batch owns the source. */
    usable: () => !failed && options.catalog?.current !== undefined && options.catalog.updating === false,
    /** The latest non-background batch failed and no later one completed. */
    failed: () => failed,
    /** Message of the failure, when any. */
    failure: () => String(failure instanceof Error ? failure.message : failure ?? '').split('\n')[0],
    /** A catalog is attached at all. */
    attached: () => options.catalog !== undefined,
    dispose: off,
  }
}

/** Barrier type. */
export type CollectionBarrier = ReturnType<typeof createCollectionBarrier>
