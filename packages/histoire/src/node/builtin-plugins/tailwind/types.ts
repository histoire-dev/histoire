/** Public configuration for default-on Tailwind token stories. */
export interface TailwindTokensOptions {
  /** Disable discovery and generation explicitly. Defaults to true. */
  enabled?: boolean
  /** Tailwind v3 config path, relative to captured project root. */
  configFile?: string
  /** Tailwind v4 CSS entries; replaces automatic entry discovery. */
  cssFile?: string | string[]
}

/** Project-local compiler installation. */
export interface TailwindEngine {
  /** Supported compiler major. */
  major: 3 | 4
  /** Installed version for diagnostics and snapshots. */
  version: string
  /** Resolved entry, never Histoire's fallback dependency. */
  entry: string
}

/** Stable independent configuration or CSS entry. */
export interface TailwindSource {
  /** Stable public story identity. */
  id: string
  /** Absolute input file. */
  path: string
  /** Portable public source label. */
  relativePath: string
  /** Public story title. */
  title: string
}

/** One serializable design token and its visual representation. */
export interface TailwindToken {
  /** Stable category-local identity. */
  key: string
  /** Usable utility name or token label. */
  name: string
  /** Original serializable value. */
  value: unknown
  /** Usable utility, when available. */
  utility?: string
  /** Actual prefixed CSS variable, when available. */
  cssVariable?: string
  /** Inline declarations interpreted by browser renderer. */
  preview: Record<string, string>
}

/** One story variant containing a related token category. */
export interface TailwindTokenCategory {
  /** Existing stable variant ID. */
  id: string
  /** English variant label. */
  title: string
  /** Rendering behavior. */
  kind: string
  /** Ordered token entries. */
  tokens: TailwindToken[]
}

/** Immutable browser-facing theme data; no executable config functions. */
export interface TailwindSnapshot {
  /** Story identity and root-relative input label. */
  source: TailwindSource
  /** Installed compiler version. */
  version: string
  /** Utility prefix. */
  prefix: string
  /** Nonempty supported token categories. */
  categories: TailwindTokenCategory[]
  /** Serializable resolved theme/config for Full Config. */
  config: unknown
}

/** Complete staged output from one adapter invocation. */
export interface TailwindGeneration {
  /** Portable data consumed by story runtime. */
  snapshot: TailwindSnapshot
  /** Source-scoped CSS without preflight. */
  css: string
  /** Absolute input dependencies, including failed-load candidates. */
  dependencies: string[]
}
