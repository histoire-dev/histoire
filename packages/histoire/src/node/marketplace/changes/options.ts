import type { HistoireJsonValue } from '@histoire/protocol'
import type { MarketplaceOption } from '@histoire/shared'
import { equalValue } from '../../config/codemod/update.js'
import { optionPath } from '../manifest/schema.js'

/** Validates form values and returns schema paths, omitting defaults with undefined. */
export function optionEdits(schema: MarketplaceOption[], values: Record<string, HistoireJsonValue> = {}): Array<[string, HistoireJsonValue | undefined]> {
  return Object.entries(values).map(([key, value]) => {
    optionPath.parse(key)
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
    return [key, field.default !== undefined && equalValue(value, field.default) ? undefined : value]
  })
}

/** Builds nested literal options for a new factory call, never mutating form values. */
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
    if (Object.hasOwn(parent, parts.at(-1))) throw new Error('Overlapping plugin option paths')
    parent[parts.at(-1)] = value
  }
  return output
}
