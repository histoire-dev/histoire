import type { StoryCollectionOutcome } from '../../collect/outcome.js'
import type { Context } from '../../context.js'
import type { SnapshotOptions } from '../../runtime/catalog/types.js'
import { captureCatalogSnapshot as captureSnapshot } from '../../runtime/catalog/snapshot.js'
import { mcpCapturePolicy, projectMcpSnapshot } from './projection.js'

export type { CatalogSnapshot, SnapshotOptions } from '../../runtime/catalog/types.js'

/** Compatibility capture returns exact MCP/private-artifact metadata and access bounds. */
export async function captureCatalogSnapshot(ctx: Context, options: SnapshotOptions, outcomes?: Map<string, StoryCollectionOutcome>) {
  const snapshot = await captureSnapshot(ctx, { ...options, ...mcpCapturePolicy }, outcomes)
  return projectMcpSnapshot(snapshot, ctx.root, options.secret)
}
