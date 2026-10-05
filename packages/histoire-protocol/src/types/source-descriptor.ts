import type { HistoireSettings } from './settings.js'

/** Portable source appearance; executable config and filesystem paths excluded. */
export interface HistoireSourceConfig {
  /** Source display title. */
  title: string
  /** Named appearance values used by first-party surfaces. */
  theme: {
    /** Source preference used before host settings arrive. */
    defaultColorScheme: HistoireSettings['colorScheme']
    /** Class applied only inside isolated runtime. */
    darkClass: string
    /** Hide standalone appearance control when configured. */
    hideColorSchemeSwitch?: boolean
    /** Serializable theme color tokens. */
    colors?: Record<string, Record<string, string>>
  }
  /** Named logical viewport sizes. */
  responsivePresets: readonly { label: string, width: number, height?: number | null }[]
  /** Named backgrounds and corresponding text colors. */
  backgroundPresets: readonly { label: string, color: string, contrastColor?: string }[]
  /** Whether runtime derives contrast from selected background. */
  autoApplyContrastColor: boolean
  /** Existing preview story collection/readiness deadline in milliseconds. */
  storyCollectTimeout?: number
  /** Existing source test execution budget in milliseconds. */
  runTimeout?: number
  /** Source defaults for host-owned primitive globals. */
  globals?: HistoireSettings['globals']
  /** Source initial preview/capture direction. */
  textDirection?: HistoireSettings['textDirection']
}

/** Exact parent-origin policy; source document origin is always allowed. */
export interface HistoireEmbedPolicy {
  /** Additional exact HTTP(S) origins. */
  allowedOrigins: readonly string[]
  /** Explicit cross-origin editor permission. */
  allowOpenInEditor: boolean
  /** Explicit cross-origin dev test permission. */
  allowServerTests: boolean
}

/** Opaque same-book content references, resolved only by source document. */
export interface HistoireSourceAssets {
  /** Lazy search document containing structured targets. */
  search: string
  /** Exact story content inventory, never arbitrary caller URLs. */
  content: readonly {
    /** Exact collected story identity. */
    storyId: string
    /** Optional documentation asset. */
    docs?: string
    /** Optional original registered source asset. */
    rawSource?: string
  }[]
}
