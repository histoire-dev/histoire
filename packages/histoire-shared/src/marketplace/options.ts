import type { HistoireJsonValue } from '@histoire/protocol'
import type { MarketplaceOption } from '../types/marketplace.js'

/** Prototype-sensitive paths never reach object construction or config editing. */
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])

/** Reject prototype-sensitive keys while allowing package names in JSON records. */
export function isSafeObjectKey(value: string): boolean {
  return !forbidden.has(value)
}

/** Accept only ordinary identifiers in declarative option paths. */
export function isOptionPath(value: string): boolean {
  return value.length > 0 && value.length <= 500 && value.split('.').every(part => /^[a-z_$][\w$]*$/i.test(part) && isSafeObjectKey(part))
}

/** Validate form values and return schema paths, omitting defaults with undefined. */
export function optionEdits(schema: MarketplaceOption[], values: Record<string, HistoireJsonValue> = {}): Array<[string, HistoireJsonValue | undefined]> {
  return Object.entries(values).map(([key, value]) => {
    if (!isOptionPath(key)) throw new Error('Invalid option path')
    const field = schema.find(option => option.key === key)
    if (!field) throw new Error(`Unknown plugin option: ${key}`)
    const valid = field.type === 'boolean'
      ? typeof value === 'boolean'
      : field.type === 'string'
        ? typeof value === 'string' && value.length <= 500
        : field.type === 'string-list'
          ? Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string' && item.length <= 500)
          : typeof value === 'string' && field.choices.some(choice => choice.value === value)
    if (!valid) throw new Error(`Invalid plugin option: ${key}`)
    // Defaults can only be primitives or string arrays, so JSON equality is structural.
    return [key, field.default !== undefined && JSON.stringify(value) === JSON.stringify(field.default) ? undefined : value]
  })
}

/** Build nested literal options without mutating form values or their arrays. */
export function pluginOptions(schema: MarketplaceOption[], values?: Record<string, HistoireJsonValue>): Record<string, HistoireJsonValue> {
  const output: Record<string, HistoireJsonValue> = {}
  for (const [key, value] of optionEdits(schema, values)) {
    if (value === undefined) continue
    const parts = key.split('.')
    let parent = output
    for (const part of parts.slice(0, -1)) {
      parent[part] ??= {}
      const child = parent[part]
      if (!child || Array.isArray(child) || typeof child !== 'object') throw new Error('Overlapping plugin option paths')
      parent = child
    }
    const leaf = parts.at(-1)!
    if (Object.hasOwn(parent, leaf)) throw new Error('Overlapping plugin option paths')
    parent[leaf] = Array.isArray(value) ? [...value] : value
  }
  return output
}
