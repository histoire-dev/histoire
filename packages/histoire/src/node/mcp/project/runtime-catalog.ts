import type { ProjectRuntimeHandle } from '../../runtime/types.js'
import { attachRuntimeCatalog } from '../../runtime/catalog/attachment.js'
import { createProjectCatalog } from './catalog.js'

/** Reuses generation canonical publication while retaining MCP projection policy. */
export function attachProjectCatalog(runtime: ProjectRuntimeHandle, options: { projectId: string, secret?: string }) {
  const attachment = attachRuntimeCatalog(runtime, { ...options, epoch: runtime.epoch })
  const catalog = createProjectCatalog({ ...options, epoch: runtime.epoch, root: runtime.context.root, provider: attachment.catalog })
  return { catalog, ready: attachment.ready, close: attachment.close }
}
