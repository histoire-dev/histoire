import type { ASTNode } from 'magicast'
import type { ConfigPathAnalysis, ParsedConfig } from './types.js'
import { parseModule } from 'magicast'

/** Parses TS/JS once, retaining Babel byte offsets and recast original nodes. */
export function parseConfigCode(code: string): ParsedConfig {
  const program = parseModule(code, { tabWidth: 1 }).$ast
  if (program.type !== 'Program') throw new Error('Expected a JavaScript program')
  restoreSourceOffsets(program, code)
  const parsed: ParsedConfig = { code, program, bindings: new Map(), imports: new Map() }
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) parsed.imports.set(specifier.local.name, statement.source.value)
    }
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (declaration?.type === 'VariableDeclaration') collectBindings(parsed, declaration)
  }
  return parsed
}

/** Restores byte offsets after recast normalizes tabs and CRLF line endings. */
function restoreSourceOffsets(program: ASTNode, code: string): void {
  const offsets: number[] = []
  const lines = [0]
  for (let index = 0; index < code.length; index++) {
    offsets.push(index)
    if (code[index] === '\r' && code[index + 1] === '\n') index++
    if (['\r', '\n', '\u2028', '\u2029'].includes(code[index])) lines.push(index + 1)
  }
  offsets.push(code.length)
  /** Reconstructs original columns, including single-character tab indentation. */
  function position(index: number) {
    let low = 0
    let high = lines.length
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2)
      if (lines[middle] <= index) low = middle
      else high = middle
    }
    const line = low
    return { line: line + 1, column: index - lines[line], index }
  }
  /** Visits AST fields only; recast's original/loc metadata contains cycles. */
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
    }
    else if (value && typeof value === 'object' && 'type' in value) {
      const node = value as ASTNode
      if (typeof node.start === 'number' && typeof node.end === 'number') {
        node.start = offsets[node.start]
        node.end = offsets[node.end]
        node.loc = { start: position(node.start), end: position(node.end), filename: undefined, identifierName: undefined }
      }
      for (const [key, child] of Object.entries(node)) {
        if (!['loc', 'original', 'tokens', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) visit(child)
      }
    }
  }
  visit(program)
}

/** Registers direct declarations in the one supported config factory scope. */
export function collectBindings(parsed: ParsedConfig, declaration: Extract<ASTNode, { type: 'VariableDeclaration' }>): void {
  for (const item of declaration.declarations) {
    if (item.id.type === 'Identifier') parsed.bindings.set(item.id.name, { kind: declaration.kind, node: item.init })
    else markComputedBindings(parsed, item.id, 'destructured')
  }
}

/** Records every lexical name in unsupported patterns instead of leaking outer bindings. */
export function markComputedBindings(parsed: ParsedConfig, node: ASTNode, kind: string): void {
  if (node.type === 'Identifier') {
    parsed.bindings.set(node.name, { kind })
  }
  else if (node.type === 'AssignmentPattern') {
    markComputedBindings(parsed, node.left, kind)
  }
  else if (node.type === 'RestElement') {
    markComputedBindings(parsed, node.argument, kind)
  }
  else if (node.type === 'ArrayPattern') {
    for (const element of node.elements) {
      if (element) markComputedBindings(parsed, element, kind)
    }
  }
  else if (node.type === 'ObjectPattern') {
    for (const property of node.properties) markComputedBindings(parsed, property.type === 'RestElement' ? property.argument : property.value, kind)
  }
}

/** Removes syntax-only TypeScript wrappers without following executable code. */
export function unwrapNode(node: ASTNode): ASTNode {
  if (['TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'TSNonNullExpression', 'ParenthesizedExpression'].includes(node.type)) {
    return unwrapNode((node as Extract<ASTNode, { type: 'TSAsExpression' }>).expression)
  }
  return node
}

/** Describes a refusal at the exact expression which caused it. */
export function nodeIssue(node: ASTNode, reason: string, status: ConfigPathAnalysis['status'] = 'computed'): ConfigPathAnalysis {
  const location = node.loc ? { line: node.loc.start.line, column: node.loc.start.column + 1 } : undefined
  return { status, location, reason: `${reason}${location ? ` at line ${location.line}` : ''}` }
}

/** Converts parser errors to UI-safe analysis without attempting source execution. */
export function parseIssue(error: unknown): ConfigPathAnalysis {
  const parsed = error as { message?: string, loc?: { line: number, column: number } }
  return {
    status: 'computed',
    reason: parsed.message ?? String(error),
    location: parsed.loc ? { line: parsed.loc.line, column: parsed.loc.column + 1 } : undefined,
  }
}
