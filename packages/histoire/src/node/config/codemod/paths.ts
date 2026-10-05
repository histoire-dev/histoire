import type { ConfigPatch, JsonValue, PathToken } from './types.js'

/** Root settings writable by the dev-only project settings channel. */
export const CONFIG_EDITABLE_PATHS = [
  'responsivePresets',
  'backgroundPresets',
  'theme.defaultColorScheme',
  'ui.defaultArrange',
  'agents.presets',
  'agents.permissions',
] as const

/** Parses only documented paths; arbitrary properties and prototype keys fail. */
export function parseConfigPath(path: string): PathToken[] {
  if ((CONFIG_EDITABLE_PATHS as readonly string[]).includes(path)) return path.split('.')
  const agent = /^agents\.presets\[([\w-]+)\](?:\.(id|name|command|args|cwd|default))?$/.exec(path)
  if (agent) return ['agents', 'presets', { id: agent[1] }, ...agent[2] ? [agent[2]] : []]
  throw new Error(`Config path "${path}" is not editable`)
}

/** Enforces JSON semantics before AST generation, rejecting secrets in presets. */
export function assertConfigPath(path: string, value?: JsonValue): void {
  parseConfigPath(path)
  if (value === undefined) return
  const seen = new Set<object>()
  /** Checks every nested value without invoking getters or serializing functions. */
  function visit(item: unknown): void {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return
    if (typeof item === 'number' && Number.isFinite(item)) return
    if (typeof item !== 'object' || seen.has(item)) throw new Error('Config values must be JSON-serializable')
    seen.add(item)
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new Error('Config values must be plain JSON objects')
    }
    if (Object.getOwnPropertySymbols(item).length) throw new Error('Config values must be JSON-serializable')
    if (Array.isArray(item) && (Object.keys(item).length !== item.length || Object.keys(item).some((key, index) => key !== String(index)))) {
      throw new Error('Config arrays must contain contiguous JSON values')
    }
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(item))) {
      if (Array.isArray(item) && key === 'length') continue
      if (!('value' in descriptor) || !descriptor.enumerable) throw new Error('Config values must be JSON-serializable')
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`Config key "${key}" is not editable`)
      if (path.startsWith('agents.presets') && key === 'env') throw new Error('Agent env values cannot be saved to project config')
      visit(descriptor.value)
    }
    seen.delete(item)
  }
  visit(value)
}

/** Validates a patch collection before reading or changing source. */
export function assertConfigPatches(patches: ConfigPatch[]): void {
  for (const patch of patches) assertConfigPath(patch.path, patch.value)
}
