import type { HistoireSession } from '@histoire/sdk'
import { computed, nextTick, shallowRef } from 'vue'

/** Dialog identity is captured independently from active workbench selection. */
export interface EmbedDialogTarget {
  /** Exact story identity. */
  storyId: string
  /** Exact variant identity; omission gives story scope. */
  variantId?: string
  /** Captured source lifetime prevents reconnect adopting an old action. */
  sourceId: string
  /** Captured source generation. */
  epoch: string
}

/** One workbench owns target, catalog observer, and async clipboard generation. */
export function createEmbedController(session: HistoireSession) {
  const snapshot = shallowRef(session.getSnapshot())
  const target = shallowRef<EmbedDialogTarget | null>(null)
  const generation = shallowRef(0)
  let active = true
  let focus: HTMLElement | null = null
  const stop = session.subscribe((value) => {
    const previous = snapshot.value
    if (previous.status !== value.status || previous.source?.epoch !== value.source?.epoch || previous.source?.revision !== value.source?.revision || previous.source?.sourceId !== value.source?.sourceId) generation.value++
    snapshot.value = value
  })
  /** Resolve one unambiguous runtime story without selecting or importing it. */
  function find(storyId: string, variantId?: string) {
    const value = snapshot.value
    const stories = value.catalog.stories.filter(story => story.id === storyId)
    const story = stories.length === 1 ? stories[0] : undefined
    if (value.status !== 'ready' || value.stale || !story || story.docsOnly || !story.variants.length) return
    if (variantId !== undefined && story.variants.filter(variant => variant.id === variantId).length !== 1) return
    return story
  }
  const story = computed(() => {
    const capture = target.value
    const source = snapshot.value.source
    if (!capture || source?.sourceId !== capture.sourceId || source.epoch !== capture.epoch) return
    return find(capture.storyId, capture.variantId)
  })
  /** Native dialog dismissal restores original workbench trigger when still present. */
  function close(): void {
    const current = ++generation.value
    const trigger = focus
    target.value = null
    focus = null
    // Wait until native modal leaves top layer; outside focus is blocked before then.
    void nextTick(() => {
      if (active && generation.value === current && !target.value && trigger?.isConnected) trigger.focus({ preventScroll: true })
    })
  }
  return { snapshot, target, generation, story,
    /** Share eligibility between tree menus, frame menus, and toolbar. */
    available: (storyId: string, variantId?: string) => active && Boolean(find(storyId, variantId)),
    /** Snapshot identities only; matrix props and current state never enter snippets. */
    open(storyId: string, variantId?: string, trigger?: HTMLElement | null): void {
      if (!active || !find(storyId, variantId)) return
      const source = snapshot.value.source!
      focus = trigger ?? (typeof document === 'undefined' ? null : document.activeElement as HTMLElement)
      generation.value++
      target.value = { storyId, ...(variantId === undefined ? {} : { variantId }), sourceId: source.sourceId, epoch: source.epoch }
    }, close,
    /** Dispose only this observer/dialog; caller session remains live. */
    dispose(): void {
      active = false
      close()
      stop()
    } }
}

/** Explicit owner passed into lazily loaded dialog and toolbar. */
export type EmbedController = ReturnType<typeof createEmbedController>
