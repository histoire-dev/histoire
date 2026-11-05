import type { ASTNode } from 'magicast'
import type { PropertyNode } from '../../config/codemod/types.js'
import { parseConfigCode } from '../../config/codemod/parse.js'
import { applySourceEdits, printValue, removeProperty } from '../../config/codemod/source-edit.js'

/** Finds an existing runtime named import, including its authored alias. */
export function factoryImports(code: string, id: string, name: string): string[] {
  const found: string[] = []
  const parsed = parseConfigCode(code)
  for (const statement of parsed.program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== id || statement.importKind === 'type') continue
    for (const item of statement.specifiers) {
      if (item.type !== 'ImportSpecifier' || item.importKind === 'type') continue
      const imported = item.imported.type === 'Identifier' ? item.imported.name : item.imported.value
      if (imported === name && !parsed.bindings.has(item.local.name)) found.push(item.local.name)
    }
  }
  return found
}

/** Finds the first reusable runtime factory alias. */
export function factoryImport(code: string, id: string, name: string): string | undefined {
  return factoryImports(code, id, name)[0]
}

/** Visits syntax nodes only, ignoring recast's cyclic location/original metadata. */
function identifiers(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach(item => identifiers(item, names))
  }
  else if (node && typeof node === 'object' && 'type' in node) {
    const syntax = node as ASTNode
    if (syntax.type === 'Identifier') names.add(syntax.name)
    for (const [key, value] of Object.entries(syntax)) {
      if (!['loc', 'original', 'tokens', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) identifiers(value, names)
    }
  }
}

/** Adds a collision-free named import without reprinting authored statements. */
export function ensureFactoryImport(code: string, id: string, name: string): { /** Updated source. */ code: string, /** Local call identifier. */ local: string } {
  const existing = factoryImport(code, id, name)
  if (existing) return { code, local: existing }
  const parsed = parseConfigCode(code)
  const names = new Set<string>()
  identifiers(parsed.program, names)
  let local = name
  for (let suffix = 2; names.has(local); suffix++) local = `${name}${suffix}`
  const newline = code.includes('\r\n') ? '\r\n' : '\n'
  const statement = `import { ${name}${local === name ? '' : ` as ${local}`} } from ${printValue(code, id)}${newline}`
  // Keep shebangs/directives before imports. New statement never merges with a
  // type-only import or rewrites comments attached to an existing declaration.
  const offset = parsed.program.body[0]?.start ?? code.length
  return { code: code.slice(0, offset) + statement + code.slice(offset), local }
}

/** Removes only an unused factory specifier, retaining other exports and uses. */
export function removeUnusedFactoryImport(code: string, id: string, local: string): string {
  const parsed = parseConfigCode(code)
  const names = new Set<string>()
  identifiers(parsed.program.body.filter(statement => statement.type !== 'ImportDeclaration'), names)
  if (names.has(local)) return code
  for (const statement of parsed.program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== id) continue
    const index = statement.specifiers.findIndex(item => item.local.name === local)
    if (index === -1) continue
    if (statement.specifiers.length === 1) {
      const end = statement.end + (/^\r?\n/.exec(code.slice(statement.end))?.[0].length ?? 0)
      return code.slice(0, statement.start) + code.slice(end)
    }
    const item = statement.specifiers[index]
    const named = statement.specifiers.filter(specifier => specifier.type === 'ImportSpecifier')
    if (named.length === 1 && statement.specifiers.some(specifier => specifier.type === 'ImportDefaultSpecifier')) {
      const open = code.lastIndexOf('{', item.start)
      const start = code.lastIndexOf(',', open)
      const end = code.indexOf('}', item.end) + 1
      return code.slice(0, start) + code.slice(end)
    }
    // Same comma/trivia rules as ordinary properties; a retained trailing comma
    // is valid in a named import, even when its last specifier was removed.
    return applySourceEdits(code, [removeProperty(parsed, item as unknown as PropertyNode)])
  }
  return code
}
