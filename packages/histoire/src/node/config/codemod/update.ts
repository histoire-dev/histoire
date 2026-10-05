import type { ASTNode } from 'magicast'
import type { JsonValue, ParsedConfig, PathToken, SourceEdit } from './types.js'
import { resolveLocalNode } from './locate.js'
import { appendEntry, printValue, removeProperty, replaceNode } from './source-edit.js'
import { findProperty, propertyName, staticValue } from './walk.js'

/** Compares JSON values by structure, independent of object insertion order. */
export function equalValue(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equalValue(left[key], right[key]))
}

/** Builds literal parents for a newly inserted nested path. */
export function missingValue(tokens: PathToken[], value: JsonValue): JsonValue {
  const token = tokens[0]
  if (!token) return value
  if (typeof token === 'string') return { [token]: missingValue(tokens.slice(1), value) }
  const preset = missingValue(tokens.slice(1), value)
  if (!preset || Array.isArray(preset) || typeof preset !== 'object') throw new Error('Agent preset must be an object')
  if (preset.id !== undefined && preset.id !== token.id) throw new Error('Agent preset id must match selected path')
  return [{ id: token.id, ...preset }]
}

/** Updates JSON containers in place, preserving matched preset labels and comments. */
export function updateValue(parsed: ParsedConfig, input: ASTNode, value: JsonValue): SourceEdit[] {
  const current = staticValue(parsed, input)
  if (current.issue) throw new Error(current.issue.reason)
  if (equalValue(current.value, value)) return []
  const resolved = resolveLocalNode(parsed, input)
  if (resolved.issue) throw new Error(resolved.issue.reason)
  const node = resolved.node
  if (node.type === 'ObjectExpression' && value && !Array.isArray(value) && typeof value === 'object') {
    const retained = node.properties.filter(property => Object.hasOwn(value, propertyName(property)))
    if (!retained.length) return [replaceNode(node, printValue(parsed.code, value))]
    const edits: SourceEdit[] = []
    for (const property of node.properties) {
      const key = propertyName(property)
      if (property.type !== 'ObjectProperty') throw new Error('Cannot edit computed object value')
      if (!Object.hasOwn(value, key)) edits.push(removeProperty(parsed, property))
      else edits.push(...updateValue(parsed, property.value, value[key]))
    }
    const additions = Object.entries(value).filter(([key]) => !findProperty(node, key).property)
    if (additions.length) {
      // One insertion avoids colliding byte offsets when several keys are added.
      const entries = additions.map(([key, item]) => `${printKey(parsed.code, key)}: ${printValue(parsed.code, item)}`)
      edits.push(...appendEntry(parsed, { ...node, properties: retained }, entries.join(', ')))
    }
    return edits
  }
  if (node.type === 'ArrayExpression' && Array.isArray(value)) {
    const old = current.value as JsonValue[]
    const keys = old.map(item => presetKey(item))
    if (old.length === value.length && keys.every((key, index) => key !== undefined && key === presetKey(value[index])) && new Set(keys).size === keys.length) {
      return node.elements.flatMap((item, index) => updateValue(parsed, item, value[index]))
    }
  }
  const rawQuote = node.type === 'StringLiteral' ? parsed.code[node.start] : undefined
  return [replaceNode(node, printValue(parsed.code, value, rawQuote === '"' ? 'double' : rawQuote === '\'' ? 'single' : undefined))]
}

/** Prints unusual JSON property names as source string literals. */
export function printKey(code: string, key: string): string {
  return /^[a-z_$][\w$]*$/i.test(key) ? key : printValue(code, key)
}

/** Returns stable matching identity for viewport/background and agent presets. */
function presetKey(value: JsonValue): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (typeof value.label === 'string') return `label:${value.label}`
  if (typeof value.id === 'string') return `id:${value.id}`
}
