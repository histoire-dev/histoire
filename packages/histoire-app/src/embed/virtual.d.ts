declare module 'virtual:$histoire-embed-source' {
  import type { HistoireSourceDescriptor } from '@histoire/protocol'
  /** Source-owned configured book base. */
  export const bookBase: string
  /** Owned completed-publication listener with caller cleanup. */
  export function subscribeSource(listener: (descriptor: HistoireSourceDescriptor | null) => void): () => void
}
