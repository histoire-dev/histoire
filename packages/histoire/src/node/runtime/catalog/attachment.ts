import type { ProjectRuntimeHandle } from '../types.js'
import type { SnapshotOptions } from './types.js'
import { CatalogContentChangedError } from '../content/files.js'
import { createRuntimeCatalog } from './publication.js'

/** One canonical provider per runtime generation, shared by attached adapters. */
const attachments = new WeakMap<ProjectRuntimeHandle, ReturnType<typeof createAttachment>>()
/** Context discovery seam for Vite virtual source modules created before handle attachment. */
const contexts = new WeakMap<ProjectRuntimeHandle['context'], ReturnType<typeof createAttachment>>()

/** Connects generation-owned collection completion to atomic catalog/content publication. */
function createAttachment(runtime: ProjectRuntimeHandle, options: SnapshotOptions) {
  let disposed = false
  const catalog = createRuntimeCatalog({ ...options, root: runtime.context.root, isActive: () => !disposed && runtime.isActive() })
  /** Keeps readable last completion when watcher input overtakes collection bytes. */
  async function publish(outcomes = runtime.collectionOutcomes) {
    try {
      await catalog.publish(runtime.context, outcomes)
    }
    catch (error) {
      if (!(error instanceof CatalogContentChangedError)) throw error
      catalog.markUpdating()
    }
  }
  const off = runtime.onCollection(async (event) => {
    if (disposed || !runtime.isActive()) return
    if (event.phase === 'started') catalog.markUpdating()
    if (event.phase === 'completed') await publish(event.outcomes)
    if (event.phase === 'failed') {
      const outcomes = new Map(event.outcomes)
      for (const file of event.files.length ? event.files : runtime.context.storyFiles) outcomes.set(file.path, { status: 'failed', error: event.error })
      await publish(outcomes)
    }
  })
  const ready = runtime.ready.then(async () => {
    if (!catalog.current) await publish()
  })
  void ready.catch(() => {})
  return {
    catalog,
    ready,
    /** Invalidates immediately; outstanding hashing cannot publish after disposal. */
    close() {
      disposed = true
      off()
      contexts.delete(runtime.context)
    },
  }
}

/** Obtains canonical provider without duplicate collector observers or source readers. */
export function attachRuntimeCatalog(runtime: ProjectRuntimeHandle, options: SnapshotOptions) {
  let attachment = attachments.get(runtime)
  if (!attachment) {
    attachments.set(runtime, attachment = createAttachment(runtime, { ...options, epoch: runtime.epoch }))
    contexts.set(runtime.context, attachment)
  }
  return attachment
}

/** Looks up shared generation publication without creating another provider or collector. */
export function getRuntimeCatalogForContext(context: ProjectRuntimeHandle['context']) {
  return contexts.get(context)
}
