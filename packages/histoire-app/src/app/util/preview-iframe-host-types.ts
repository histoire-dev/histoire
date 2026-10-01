import type { Story, Variant } from '../types'

/** Preview slot owned by one iframe host. */
export type PreviewIframeMode = 'single' | 'grid'

/** Inputs needed by shared single/grid preview hosting logic. */
export interface PreviewIframeHostOptions {
  /** Preview slot and selection behavior. */
  mode: PreviewIframeMode
  /** Story currently shown, if navigation has completed. */
  getStory: () => Story | null | undefined
  /** Variant currently selected by this host. */
  getCurrentVariant: () => Variant | null | undefined
  /** Resolves one current-story variant by id. */
  getVariantById: (variantId: string) => Variant | null | undefined
  /** Marks owned variants as awaiting their runtime. */
  markPreviewPending: () => void
  /** Handles selection made inside a grid runtime. */
  onSelectVariant?: (variantId: string) => void
  /** Runs navigation reset during component setup when needed. */
  resetOnMount?: boolean
}
