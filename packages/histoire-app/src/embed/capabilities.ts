import type { HistoireCapabilities, HistoireSurface } from '@histoire/protocol'
import { HISTOIRE_SURFACES } from '@histoire/protocol'

/** First-party implementation registry; surface slices enable their completed bootstrap here. */
export const implementedEmbedSurfaces: readonly HistoireSurface[] = Object.freeze(['explorer', 'preview', 'grid', 'tests', 'controls', 'docs', 'source', 'tree', 'search', 'toolbar', 'events'])

/** Pure shared source/bootstrap capability projection; imports safely without DOM or Vue. */
export function createEmbedSurfaceCapabilities(): HistoireCapabilities['surfaces'] {
  return Object.fromEntries(HISTOIRE_SURFACES.map(surface => [surface, implementedEmbedSurfaces.includes(surface)
    ? { available: true }
    : { available: false, reason: 'CAPABILITY_UNAVAILABLE' }])) as HistoireCapabilities['surfaces']
}
