import type { RunOptions } from 'axe-core'
import { measureWireValue } from '@histoire/protocol'

/** Axe severity ordered from lowest to highest. */
export type A11yImpact = 'minor' | 'moderate' | 'serious' | 'critical'

/** Configurable scan settings shared by UI and assertions. */
export interface A11yScanOptions {
  /** Axe rule selection and enabled overrides; defaults to axe defaults. */
  axe?: Pick<RunOptions, 'runOnly' | 'rules'>
  /** Selectors excluded within variant root; defaults to none. */
  exclude?: string[]
  /** Scan deadline in milliseconds, 1–30000; defaults to 10000. */
  timeoutMs?: number
}

/** Options of automatic tests and explicit assertions. */
export interface A11yTestOptions extends A11yScanOptions {
  /** Lowest failing impact; omitted means every violation fails. Unknown impact always fails. */
  minimumImpact?: A11yImpact
}

/** Configuration of HstA11y. */
export interface A11yOptions extends A11yScanOptions {
  /** Enable UI and automatic tests; defaults to true. */
  enabled?: boolean
  /** Exclude UI and scanner from static books; defaults to false. */
  devOnly?: boolean
  /** Initial user preference for live checks while tab open; defaults to true. */
  autoRun?: boolean
  /** Register fresh-mount tests per variant; defaults to false. Feeds the Accessibility pane on the dev server. */
  test?: boolean | Pick<A11yTestOptions, 'minimumImpact'>
  /** Check every variant during `histoire build` and embed the report into the book's Accessibility pane; needs Playwright. Defaults to false. */
  build?: boolean
}

/** Serializable settings shared with workbench and frame modules. */
export interface BrowserOptions extends A11yScanOptions {
  /** Initial user preference. */
  autoRun: boolean
  /** Scoped excluded selectors. */
  exclude: string[]
  /** Bounded scan deadline. */
  timeoutMs: number
}

/** Validate public settings before generating browser configuration. */
export function normalizeOptions(options: A11yOptions = {}): BrowserOptions {
  for (const key of ['enabled', 'devOnly', 'autoRun', 'build'] as const) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new Error(`[HstA11y] ${key} must be a boolean`)
  }
  const timeoutMs = options.timeoutMs ?? 10000
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('[HstA11y] timeoutMs must be between 1 and 30000')
  if (options.exclude !== undefined && (!Array.isArray(options.exclude) || options.exclude.some(value => typeof value !== 'string' || !value.trim()))) throw new Error('[HstA11y] exclude must contain nonempty selectors')
  const impact = typeof options.test === 'object' ? options.test?.minimumImpact : undefined
  if (impact !== undefined && !['minor', 'moderate', 'serious', 'critical'].includes(impact)) throw new Error('[HstA11y] Invalid minimumImpact')
  // Browser settings travel as plain JSON, never callbacks or custom engine configuration.
  if (options.axe !== undefined && (!options.axe || typeof options.axe !== 'object' || Array.isArray(options.axe))) throw new Error('[HstA11y] axe must contain rule options')
  if (options.axe) measureWireValue(options.axe, { mode: 'json' })
  return { autoRun: options.autoRun ?? true, exclude: options.exclude ?? [], timeoutMs, ...(options.axe ? { axe: options.axe } : {}) }
}
