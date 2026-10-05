import type { HstControlOption } from './types'

/** Supported public option forms shared by menus and segmented controls. */
export type HstControlOptions = Record<string, any> | string[] | number[] | HstControlOption[]

/** Normalize presentation without coercing values or merging duplicate labels. */
export function normalizeControlOptions(options: HstControlOptions): HstControlOption[] {
  return Array.isArray(options)
    ? options.map(option => typeof option === 'object' && option !== null ? option : { value: option, label: String(option) })
    : Object.entries(options).map(([value, label]) => ({ value, label: String(label) }))
}
