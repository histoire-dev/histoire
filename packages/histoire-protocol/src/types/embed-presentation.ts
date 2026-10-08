/** Panels available in a scoped story or variant embed. */
export const HISTOIRE_EMBED_PANELS = ['controls', 'docs', 'source', 'events'] as const

/** One opt-in scoped embed panel. */
export type HistoireEmbedPanel = typeof HISTOIRE_EMBED_PANELS[number]

/** Presentation hints change composition, never parent authority. */
export interface HistoireEmbedPresentation {
  /** Render scoped composition instead of full explorer. */
  type: 'embed'
  /** Capture selected story or exact selected variant at mount. */
  scope: 'story' | 'variant'
  /** Enabled panels; omission enables Controls, empty array hides all panels. */
  panels?: readonly HistoireEmbedPanel[]
}

/** Target and panels for a self-starting public embed document. */
export interface HistoireEmbedDocumentOptions {
  /** Exact collected story ID. */
  storyId: string
  /** Exact variant ID; omission enables the story's variant switcher. */
  variantId?: string
  /** Enabled panels in canonical order. */
  panels: readonly HistoireEmbedPanel[]
}
