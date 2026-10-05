import type { ASTNode } from 'magicast'
import type { ConfigPatch, JsonValue, ParsedConfig } from './types.js'
import { locateConfigObject, resolveLocalNode } from './locate.js'
import { unwrapNode } from './parse.js'
import { parseConfigPath } from './paths.js'
import { equalValue } from './update.js'
import { locateConfigPath, staticValue } from './walk.js'

/** One config expression that reads a supported local literal binding. */
interface LocalReference {
  /** Local const name resolved by this expression. */
  name: string
  /** Original source start used to identify this exact reference. */
  start: number
  /** Original source end used to identify this exact reference. */
  end: number
}

/** Refuses mutating a local initializer when another config value still owns it. */
export function assertSharedInitializerOwnership(before: ParsedConfig, after: ParsedConfig, patches: readonly ConfigPatch[]): void {
  const config = locateConfigObject(before)
  if (!config.object || config.issue) throw new Error(config.issue?.reason ?? 'Config must be an object literal')
  const references = collectLocalReferences(before, config.object)
  const selected = selectedReferences(before, config.object, references, patches)
  for (const name of new Set(references.map(reference => reference.name))) {
    if (!bindingChanged(before, after, name)) continue
    if (references.some(reference => reference.name === name && !selected.has(referenceKey(reference)))) {
      throw new Error('Cannot edit a shared initializer with retained config references')
    }
  }
}

/** Walks config values only, excluding object keys and unrelated executable syntax. */
function collectLocalReferences(parsed: ParsedConfig, input: ASTNode): LocalReference[] {
  const references: LocalReference[] = []
  function visit(value: ASTNode): void {
    const node = unwrapNode(value)
    if (node.type === 'Identifier') {
      const binding = parsed.bindings.get(node.name)
      if (binding?.kind === 'const' && binding.node && !resolveLocalNode(parsed, node).issue) {
        references.push({ name: node.name, start: node.start, end: node.end })
      }
      return
    }
    if (node.type === 'ObjectExpression') {
      for (const property of node.properties) {
        if (property.type === 'ObjectProperty') visit(property.value)
      }
    }
    else if (node.type === 'ArrayExpression') {
      for (const item of node.elements) {
        if (item) visit(item)
      }
    }
  }
  visit(input)
  return references
}

/** Finds references explicitly covered by at least one source patch. */
function selectedReferences(parsed: ParsedConfig, object: NonNullable<ReturnType<typeof locateConfigObject>['object']>, references: LocalReference[], patches: readonly ConfigPatch[]): Set<string> {
  const selected = new Set<string>()
  for (const patch of patches) {
    const located = locateConfigPath(parsed, object, parseConfigPath(patch.path))
    if (!located.node) continue
    for (const reference of references) {
      if (reference.start >= located.node.start && reference.end <= located.node.end) selected.add(referenceKey(reference))
    }
  }
  return selected
}

/** Detects a changed local literal initializer without executing config code. */
function bindingChanged(before: ParsedConfig, after: ParsedConfig, name: string): boolean {
  const original = bindingValue(before, name)
  const next = bindingValue(after, name)
  return original !== undefined && (next === undefined || !equalValue(original, next))
}

/** Reads a literal local initializer's static JSON value. */
function bindingValue(parsed: ParsedConfig, name: string): JsonValue | undefined {
  const binding = parsed.bindings.get(name)
  if (binding?.kind !== 'const' || !binding.node) return undefined
  const result = staticValue(parsed, binding.node)
  return result.issue ? undefined : result.value
}

/** Builds a stable set key for a source range. */
function referenceKey(reference: LocalReference): string {
  return `${reference.start}:${reference.end}`
}
