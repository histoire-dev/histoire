import type { ASTNode } from 'magicast'
import type { ObjectNode, ParsedConfig, ResolvedNode } from './types.js'
import { collectBindings, markComputedBindings, nodeIssue, unwrapNode } from './parse.js'

/** Follows one local const, refusing imports, mutable variables, and alias chains. */
export function resolveLocalNode(parsed: ParsedConfig, input: ASTNode, followed = false): ResolvedNode {
  const node = unwrapNode(input)
  if (node.type !== 'Identifier') return { node }
  if (followed) return { issue: nodeIssue(node, `"${node.name}" requires another local binding`) }
  const binding = parsed.bindings.get(node.name)
  if (binding?.kind === 'destructured') return { issue: nodeIssue(node, `"${node.name}" is a destructured binding`) }
  if (binding?.kind === 'const' && binding.node) return resolveLocalNode(parsed, binding.node, true)
  if (binding) return { issue: nodeIssue(node, `"${node.name}" is not a local const with a literal initializer`) }
  const imported = parsed.imports.get(node.name)
  if (imported) return { issue: nodeIssue(node, `"${node.name}" comes from an imported value (${imported})`) }
  return { issue: nodeIssue(node, `"${node.name}" is not a local const with a literal initializer`) }
}

/** Finds the supported default export/CJS assignment and its object literal. */
export function locateConfigObject(parsed: ParsedConfig): { object?: ObjectNode, issue?: ResolvedNode['issue'] } {
  const exports: ASTNode[] = []
  for (const statement of parsed.program.body) {
    if (statement.type === 'ExportDefaultDeclaration') exports.push(statement.declaration)
    if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression' && statement.expression.operator === '=') {
      const left = statement.expression.left
      if (left.type === 'MemberExpression' && !left.computed && left.object.type === 'Identifier' && left.object.name === 'module' && left.property.type === 'Identifier' && left.property.name === 'exports') {
        exports.push(statement.expression.right)
      }
    }
  }
  if (exports.length !== 1) return { issue: nodeIssue(parsed.program, 'Expected exactly one default config export') }
  const resolved = resolveLocalNode(parsed, exports[0])
  if (resolved.issue) return resolved
  let node = resolved.node
  if (node.type === 'CallExpression') {
    if (node.callee.type !== 'Identifier' || node.callee.name !== 'defineConfig' || node.arguments.length !== 1 || node.arguments[0].type === 'SpreadElement') {
      return { issue: nodeIssue(node, 'Config comes from an unsupported call') }
    }
    node = unwrapNode(node.arguments[0])
  }
  if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') {
    for (const parameter of node.params) markComputedBindings(parsed, parameter, 'parameter')
    if (node.body.type !== 'BlockStatement') {
      node = unwrapNode(node.body)
    }
    else {
      const statements = node.body.body
      const returns = statements.filter(item => item.type === 'ReturnStatement')
      if (returns.length !== 1 || statements.some(item => !['VariableDeclaration', 'ReturnStatement', 'EmptyStatement'].includes(item.type))) {
        return { issue: nodeIssue(node, 'Config function must return a single object literal without control flow') }
      }
      for (const statement of statements) {
        if (statement.type === 'VariableDeclaration') collectBindings(parsed, statement)
      }
      const result = returns[0].argument
      if (!result) return { issue: nodeIssue(node, 'Config function has no returned object literal') }
      node = unwrapNode(result)
    }
  }
  if (node.type !== 'ObjectExpression') return { issue: nodeIssue(node, 'Config must be an object literal') }
  return { object: node }
}
