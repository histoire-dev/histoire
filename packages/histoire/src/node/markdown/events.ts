import type { Context } from '../context.js'
import { getContextRegistry } from '../runtime/registry.js'

/** Registers Markdown changes with explicit context ownership. */
export function onMarkdownListChange(ctx: Context, handler: () => unknown) {
  return getContextRegistry(ctx).events.on('markdownListChanged', handler)
}

/** Announces complete parsing/association changes only to the owning project. */
export function notifyMarkdownListChange(ctx: Context) {
  getContextRegistry(ctx).events.emit('markdownListChanged', undefined)
}
