import type { HistoireEvent } from '@histoire/protocol'
import type { SessionContext } from './context.js'

/** Store attributable current-runtime events with bounded per-session history. */
export function appendEvent(context: SessionContext, event: HistoireEvent): void {
  if (!Number.isFinite(event.timestamp) || !event.target || event.runtimeId !== context.snapshot.runtime.runtimeId || event.target.storyId !== context.snapshot.selection?.storyId) return
  const story = context.snapshot.catalog.stories.find(story => story.id === event.target.storyId)
  if (story?.variants.filter(variant => variant.id === event.target.variantId).length !== 1) return
  const cleaned = context.copy({ ...event, sequence: ++context.eventCounter })
  const items = [...context.snapshot.events.items, cleaned]
  const dropped = Math.max(0, items.length - 1000)
  context.publish({ events: { items: items.slice(dropped), droppedCount: context.snapshot.events.droppedCount + dropped } })
  for (const listener of context.eventListeners) {
    try {
      listener(cleaned)
    }
    catch { /* An event consumer cannot block other subscribers or cleanup. */ }
  }
}

/** Clear retained history without reusing sequence or request identity. */
export function clearEvents(context: SessionContext): void {
  context.assertActive()
  context.publish({ events: { items: [], droppedCount: 0 } })
}
