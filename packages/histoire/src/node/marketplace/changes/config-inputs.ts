import type { ASTNode } from 'magicast'
import { readFile, realpath, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'pathe'
import { parseConfigCode } from '../../config/codemod/parse.js'

/** Package-manager outputs cannot be restart inputs while an install is running. */
const managedFile = /(?:^|\/)(?:package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/
/** Source extensions understood by the existing config parser. */
const extensions = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.tsx', '.jsx']

/** Collect literal runtime edges without evaluating config code or recast metadata. */
function imports(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) imports(item, found)
  }
  else if (value && typeof value === 'object' && 'type' in value) {
    const node = value as ASTNode
    if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
      if (('importKind' in node && node.importKind === 'type') || ('exportKind' in node && node.exportKind === 'type')) return
      if (node.type === 'ImportDeclaration' && node.specifiers.length && node.specifiers.every(item => item.type === 'ImportSpecifier' && item.importKind === 'type')) return
      if (node.source) found.add(node.source.value)
    }
    if (node.type === 'CallExpression' && (node.callee.type === 'Import' || (node.callee.type === 'Identifier' && node.callee.name === 'require'))) {
      const argument = node.arguments[0]
      if (argument?.type === 'StringLiteral') found.add(argument.value)
    }
    if (node.type === 'ImportExpression' && node.source.type === 'StringLiteral') found.add(node.source.value)
    for (const [key, child] of Object.entries(node)) {
      if (!['loc', 'original', 'tokens', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) imports(child, found)
    }
  }
}

/** Resolve local TS/JS edges without traversing installed package code. */
async function resolveInput(from: string, specifier: string): Promise<string | undefined> {
  if (!specifier.startsWith('.') && !path.isAbsolute(specifier)) return
  try {
    return createRequire(from).resolve(specifier)
  }
  catch { /* Node does not resolve extensionless TypeScript helper modules. */ }
  const base = path.resolve(path.dirname(from), specifier)
  const candidates = [base, ...extensions.map(extension => base + extension), ...extensions.map(extension => path.join(base, `index${extension}`))]
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate
    }
    catch { /* Try the next source extension. */ }
  }
}

/**
 * Inspect loaded modules plus native local imports omitted by jiti's cache.
 * Bound traversal and refuse uncertain source graphs instead of running code.
 */
export async function hasManagedConfigInput(configFile: string, dependencies: Iterable<string> = []): Promise<boolean> {
  const pending = [configFile, ...dependencies]
  const visited = new Set<string>()
  while (pending.length) {
    const file = pending.pop()!
    if (managedFile.test(file)) return true
    if (file.split('/').includes('node_modules')) continue
    const canonical = await realpath(file).catch(() => file)
    if (visited.has(canonical)) continue
    visited.add(canonical)
    if (visited.size > 256) return true
    if (!extensions.includes(path.extname(file))) continue
    try {
      if ((await stat(file)).size > 1024 * 1024) return true
      const found = new Set<string>()
      imports(parseConfigCode(await readFile(file, 'utf8')).program, found)
      for (const specifier of found) {
        if (managedFile.test(specifier)) return true
        const resolved = await resolveInput(file, specifier)
        if (resolved) pending.push(resolved)
      }
    }
    catch { return true }
  }
  return false
}
