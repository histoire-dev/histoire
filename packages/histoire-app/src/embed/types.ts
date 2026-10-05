import type { HistoireSourceDescriptor } from '@histoire/protocol'
import type { HistoireSourceConnection } from '@histoire/sdk/internal'

/** Data-only source document dependency injection; no host-defined arbitrary resource paths. */
export interface EmbedSourceOptions {
  /** Absolute configured book base URL. */
  url: string
  /** First-party standalone projection; bypasses opt-in external bridge discovery. */
  descriptor?: HistoireSourceDescriptor
  /** Source-owned finite action route namespace; never a caller-controlled fetch path. */
  actionBase?: '__histoire/embed/' | '__histoire/local/'
  /** Optional source lifetime cancellation. */
  signal?: AbortSignal
  /** Source-origin fetch implementation, injectable for data-only tests. */
  fetcher?: typeof fetch
  /** Dev completed-publication channel; null indicates document restart/disconnection. */
  subscribe?: (listener: (descriptor: HistoireSourceDescriptor | null) => void) => () => void
}

/** First-party local document source; external parent authorization belongs to bridge adapter. */
export interface EmbedSourceConnection extends HistoireSourceConnection {
  /** Effective additional origins resolved once before source handshake. */
  allowedOrigins: readonly string[]
}
