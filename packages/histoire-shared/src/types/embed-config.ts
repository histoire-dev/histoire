import type { HistoireGlobals } from '@histoire/protocol'

/** Initial isolated story settings; host sessions own later runtime values. */
export interface HistoirePreviewConfig {
  /** Initial portable globals, validated before source projection. */
  globals?: HistoireGlobals
  /** Initial isolated preview and capture direction. */
  textDirection?: 'ltr' | 'rtl'
}

/** Explicit browser embedding policy; absent configuration keeps embedding disabled. */
export interface HistoireEmbedConfig {
  /** Explicit application channel names; absent list grants no messaging authority. */
  channels?: string[]
  /** Enable public embed documents independently of MCP. Defaults false. */
  enabled?: boolean
  /** Additional exact HTTP(S) parent origins including explicit port. */
  allowedOrigins?: string[]
  /** Permit editor requests from authorized cross-origin parents. Defaults false. */
  allowOpenInEditor?: boolean
  /** Permit dev server tests from authorized cross-origin parents. Defaults false. */
  allowServerTests?: boolean
}
