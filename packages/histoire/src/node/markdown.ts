import type { Context } from './context.js'
import { createMarkdownFilesWatcher } from './markdown/watcher.js'

export { onMarkdownListChange } from './markdown/events.js'
export { createMarkdownPlugins, createMarkdownRenderer } from './markdown/renderer.js'
export { createMarkdownFilesWatcher }

/** Public watcher type retained for server/build callers. */
export type MarkdownFilesWatcher = ReturnType<typeof createMarkdownFilesWatcher>

/** Scans Markdown once while preserving existing association and renderer behavior. */
export async function scanMarkdownFiles(ctx: Context) {
  const { stop } = await createMarkdownFilesWatcher(ctx)
  await stop()
}
