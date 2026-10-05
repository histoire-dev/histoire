/** JSON DTO primitives; state transport additionally accepts undefined and BigInt. */
export type HistoireJsonValue = null | boolean | number | string | HistoireJsonValue[] | { [key: string]: HistoireJsonValue }

/** Exact selected target; null retains story without a selected variant. */
export interface HistoireTarget {
  /** Collected story ID, preserved byte-for-byte. */
  storyId: string
  /** Collected variant ID or explicit lack of variant. */
  variantId: string | null
}

/** Selection input; omitted variant restores remembered choice or first variant. */
export interface HistoireSelectionInput {
  /** Collected story ID. */
  storyId: string
  /** Explicit null requests story-only selection. */
  variantId?: string | null
}

/** All independently mountable first-party surfaces. */
export const HISTOIRE_SURFACES = ['explorer', 'preview', 'grid', 'tree', 'search', 'toolbar', 'controls', 'docs', 'source', 'events', 'tests'] as const
/** One independently mountable first-party surface name. */
export type HistoireSurface = typeof HISTOIRE_SURFACES[number]

/** Typed reason carried by unavailable capability entries. */
export interface HistoireCapability {
  /** Whether operation is currently supported and ready. */
  available: boolean
  /** Opt-in channel names; only meaningful for hostChannels capability. */
  channels?: readonly string[]
  /** Typed failure code or human-readable source reason. */
  reason?: string
}

/** Effective operation keys, distinct from source engine support. */
export type HistoireCapabilityName = 'catalog' | 'search' | 'docs' | 'rawSource' | 'dynamicSource' | 'state' | 'customControls' | 'previewTests' | 'serverTests' | 'openInEditor' | 'hostChannels'

/** Named engine/operation and per-surface availability. */
export type HistoireCapabilities = Record<HistoireCapabilityName, HistoireCapability> & { surfaces: Record<HistoireSurface, HistoireCapability> }

/** Stable source identity and last completed content publication. */
export interface HistoireSourceIdentity {
  /** Opaque source identity; never absolute project path. */
  sourceId: string
  /** Normalized HTTP(S) book base URL. */
  url: string
  /** Available source engine. */
  mode: 'dev' | 'static'
  /** Source generation lifetime. */
  epoch: string
  /** Completed content/catalog publication. */
  revision: string
}

/** Injective tuple encoding; never parse separator-concatenated IDs. */
export function getHistoireTargetKey(target: HistoireTarget): string {
  return JSON.stringify([target.storyId, target.variantId])
}
