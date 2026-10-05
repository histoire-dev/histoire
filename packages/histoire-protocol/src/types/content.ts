/** Metadata common to lazy documentation/source results. */
export interface HistoireContentIdentity {
  /** Collected story ID. */
  storyId: string
  /** Optional variant attribution. */
  variantId?: string
  /** Captured source generation. */
  epoch: string
  /** Captured completed publication. */
  revision: string
  /** Portable relative content label. */
  relativePath?: string
}

/** Lazy docs result; unavailable/empty are distinct. */
export interface HistoireDocsContent extends HistoireContentIdentity {
  /** Association/transform source. */
  origin: 'sibling' | 'standalone' | 'inline' | 'collected'
  /** Rendering policy is chosen by consumer. */
  format: 'html' | 'text'
  /** Present content, which may intentionally be empty. */
  body: string
}

/** Source text; dynamic output belongs to active story runtime. */
export interface HistoireSourceContent extends HistoireContentIdentity {
  /** Source execution mode. */
  mode: 'raw' | 'dynamic'
  /** Physical file, virtual file, or generated runtime text. */
  origin: 'file' | 'virtual' | 'generated' | 'explicit' | 'slot'
  /** Syntax label. */
  language?: string
  /** Source text, never executable loader. */
  body: string
}
