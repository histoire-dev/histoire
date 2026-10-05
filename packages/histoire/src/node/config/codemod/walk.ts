import type { ASTNode } from 'magicast'
import type { ConfigPathAnalysis, JsonValue, ObjectNode, ParsedConfig, PathToken, PropertyNode } from './types.js'
import { resolveLocalNode } from './locate.js'
import { nodeIssue, unwrapNode } from './parse.js'

/** A decoded literal, or a source-specific reason to refuse it. */
export interface StaticValue {
  /** JSON value when all nodes are static. */
  value?: JsonValue
  /** Refused expression. */
  issue?: ConfigPathAnalysis
}

/** A path target or the first missing property where insertion can begin. */
export interface LocatedPath {
  /** Existing expression at this path. */
  node?: ASTNode
  /** Its containing object or array. */
  parent?: ObjectNode | Extract<ASTNode, { type: 'ArrayExpression' }>
  /** Existing object property, when applicable. */
  property?: PropertyNode
  /** Remaining tokens starting with the first missing property. */
  missing?: PathToken[]
  /** Refusal preventing traversal. */
  issue?: ConfigPathAnalysis
}

/** Reads ordinary property names without evaluating computed keys. */
export function propertyName(property: ObjectNode['properties'][number]): string | undefined {
  if (property.type === 'SpreadElement' || property.computed) return undefined
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'StringLiteral' || property.key.type === 'NumericLiteral') return String(property.key.value)
  return undefined
}

/** Finds a stable property, rejecting duplicates and later unknown overrides. */
export function findProperty(object: ObjectNode, key: string): { property?: PropertyNode, issue?: ConfigPathAnalysis } {
  const matches = object.properties.filter(item => propertyName(item) === key)
  if (matches.length > 1) return { issue: nodeIssue(matches[1], `"${key}" has duplicate properties`) }
  const found = matches[0]
  const foundIndex = found ? object.properties.indexOf(found) : -1
  const unknown = object.properties.find((item, index) => index > foundIndex && propertyName(item) === undefined)
  if (unknown) return { issue: nodeIssue(unknown, unknown.type === 'SpreadElement' ? `"${key}" may come from a spread` : `"${key}" may come from a computed property`) }
  if (found?.type === 'ObjectMethod') return { issue: nodeIssue(found, `"${key}" is a function value`, 'function-only') }
  return { property: found as PropertyNode | undefined }
}

/** Decodes literals recursively; functions, spreads, imports and calls never run. */
export function staticValue(parsed: ParsedConfig, input: ASTNode, followed = false): StaticValue {
  const original = unwrapNode(input)
  const resolved = resolveLocalNode(parsed, original, followed)
  if (resolved.issue) return resolved
  const node = resolved.node
  const nextFollowed = followed || original.type === 'Identifier'
  if (node.type === 'NullLiteral') return { value: null }
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral' || node.type === 'BooleanLiteral') return { value: node.value }
  if (node.type === 'UnaryExpression' && ['-', '+'].includes(node.operator) && node.argument.type === 'NumericLiteral') {
    return { value: node.operator === '-' ? -node.argument.value : node.argument.value }
  }
  if (node.type === 'ArrayExpression') {
    const values: JsonValue[] = []
    for (const item of node.elements) {
      if (!item) return { issue: nodeIssue(node, 'Array contains an empty element') }
      const decoded = staticValue(parsed, item, nextFollowed)
      if (decoded.issue) return decoded
      values.push(decoded.value)
    }
    return { value: values }
  }
  if (node.type === 'ObjectExpression') {
    const values: Record<string, JsonValue> = Object.create(null)
    for (const property of node.properties) {
      const key = propertyName(property)
      if (key === undefined) return { issue: nodeIssue(property, property.type === 'SpreadElement' ? 'Value contains a spread' : 'Value contains a computed property') }
      if (property.type !== 'ObjectProperty') return { issue: nodeIssue(property, `"${key}" is a function value`, 'function-only') }
      if (Object.hasOwn(values, key)) return { issue: nodeIssue(property, `"${key}" has duplicate properties`) }
      const decoded = staticValue(parsed, property.value, nextFollowed)
      if (decoded.issue) return decoded
      values[key] = decoded.value
    }
    return { value: values }
  }
  const constructs: Partial<Record<ASTNode['type'], string>> = {
    CallExpression: 'a call result',
    ConditionalExpression: 'a conditional expression',
    TemplateLiteral: 'a template literal',
    SpreadElement: 'a spread',
    ArrowFunctionExpression: 'a function value',
    FunctionExpression: 'a function value',
    ObjectMethod: 'a function value',
  }
  const isFunction = ['ArrowFunctionExpression', 'FunctionExpression', 'ObjectMethod'].includes(node.type)
  return { issue: nodeIssue(node, `Value is ${constructs[node.type] ?? `a computed ${node.type}`}`, isFunction ? 'function-only' : 'computed') }
}

/** Traverses only literal objects and arrays selected by a stable preset id. */
export function locateConfigPath(parsed: ParsedConfig, object: ObjectNode, tokens: PathToken[]): LocatedPath {
  let current: ASTNode = object
  let result: LocatedPath = { node: object }
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    const resolved = resolveLocalNode(parsed, current)
    if (resolved.issue) return resolved
    const node = resolved.node
    if (typeof token === 'string') {
      if (node.type !== 'ObjectExpression') return { issue: nodeIssue(node, 'Path crosses a value that is not an object literal') }
      const found = findProperty(node, token)
      if (found.issue) return found
      if (!found.property) return { parent: node, missing: tokens.slice(index) }
      current = found.property.value
      result = { node: current, parent: node, property: found.property }
    }
    else {
      if (node.type !== 'ArrayExpression') return { issue: nodeIssue(node, 'Agent presets must be an array literal') }
      const matching: ASTNode[] = []
      for (const item of node.elements) {
        if (!item) return { issue: nodeIssue(node, 'Agent presets contain an empty element') }
        const decoded = staticValue(parsed, item)
        if (decoded.issue) return decoded
        if (decoded.value && !Array.isArray(decoded.value) && typeof decoded.value === 'object' && decoded.value.id === token.id) matching.push(item)
      }
      if (matching.length > 1) return { issue: nodeIssue(matching[1], `Agent preset "${token.id}" has duplicate ids`) }
      if (!matching.length) return { parent: node, missing: tokens.slice(index) }
      current = matching[0]
      result = { node: current, parent: node }
    }
  }
  return result
}
