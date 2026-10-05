import type { HistoireTarget } from './common.js'

/** Portable structured search row; exact IDs never encoded with delimiters. */
export interface HistoireSourceSearchRow {
  /** Activation target without runtime ownership. */
  target: HistoireTarget
  /** Origin of searchable text. */
  kind: 'story' | 'variant' | 'docs'
  /** Display label returned to host. */
  title: string
  /** Source-index text used by existing Fuse ranking. */
  text: string
}

/** Lazy source-owned title and documentation indexes. */
export interface HistoireSourceSearchData {
  /** Story and variant title rows in source order. */
  titles: readonly HistoireSourceSearchRow[]
  /** Preferred documentation text without arbitrary source reads. */
  docs: readonly HistoireSourceSearchRow[]
}
