import type { HistoireJsonValue } from '@histoire/protocol'
import type { MarketplaceManifest, MigrationOp } from '@histoire/shared'
import { locateConfigObject } from '../../config/codemod/locate.js'
import { parseConfigCode, unwrapNode } from '../../config/codemod/parse.js'
import { locateConfigPath, staticValue } from '../../config/codemod/walk.js'
import { analyzePluginSource } from '../../config/plugin-toggle-source.js'
import { editPluginConfig } from '../changes/config-edit.js'
import { factoryImports } from '../changes/imports.js'
import { editOptionsObject } from '../changes/options-edit.js'
import { optionPath } from '../manifest/schema.js'

/** Decode only the selected literal path; unrelated executable siblings stay untouched. */
function readOption(code: string, path: string): HistoireJsonValue | undefined {
  optionPath.parse(path)
  const parsed = parseConfigCode(code)
  const object = locateConfigObject(parsed).object
  if (!object) throw new Error('Plugin options must be an object literal')
  const found = locateConfigPath(parsed, object, path.split('.'))
  if (found.issue) throw new Error(found.issue.reason)
  if (found.missing) return
  const literal = staticValue(parsed, found.node)
  if (literal.issue) throw new Error(literal.issue.reason)
  return literal.value
}

/** Edit one object using slice 04's guarded path editor, refusing destructive renames. */
function applyOp(code: string, op: MigrationOp): string {
  if (op.op === 'set-option') return editOptionsObject(code, op.path, op.value)
  if (op.op === 'remove-option') return editOptionsObject(code, op.path, undefined)
  if (op.op !== 'rename-option') throw new Error('Unknown migration operation')
  const value = readOption(code, op.from)
  if (value === undefined || op.from === op.to) return code
  // Never overwrite a user's existing destination or move a parent into itself.
  if (op.from.startsWith(`${op.to}.`) || op.to.startsWith(`${op.from}.`)) throw new Error('Overlapping migration paths')
  const destination = readOption(code, op.to)
  if (destination !== undefined && JSON.stringify(destination) !== JSON.stringify(value)) throw new Error('Migration destination already has a different value')
  return editOptionsObject(editOptionsObject(code, op.from, undefined), op.to, value)
}

/** Apply declarative edits to exactly one imported factory's first object argument. */
export function applyMigrations(code: string, id: string, manifest: MarketplaceManifest, ops: readonly MigrationOp[]): string {
  if (!ops.length) return code
  // The existing editor validates literal plugin arrays and duplicate identities.
  editPluginConfig(code, { kind: 'update', id }, manifest)
  const aliases = factoryImports(code, id, manifest.config.import)
  const prefix = 'export default '
  const entry = analyzePluginSource(code).find((entry) => {
    const statement = parseConfigCode(prefix + entry.expression).program.body[0]
    const call = statement.type === 'ExportDefaultDeclaration' ? unwrapNode(statement.declaration) : undefined
    return call?.type === 'CallExpression' && call.callee.type === 'Identifier' && aliases.includes(call.callee.name)
  })
  if (!entry?.enabled) throw new Error('Plugin migration requires an enabled factory call')
  const expression = prefix + entry.expression
  const statement = parseConfigCode(expression).program.body[0]
  const call = statement.type === 'ExportDefaultDeclaration' ? unwrapNode(statement.declaration) : undefined
  if (call?.type !== 'CallExpression') throw new Error('Unsupported plugin call')
  const first = call.arguments[0]
  if (first && unwrapNode(first).type !== 'ObjectExpression') throw new Error('Plugin options must be an object literal')
  const original = first ? expression.slice(first.start, first.end) : '{}'
  let object = prefix + original
  for (const op of ops) object = applyOp(object, op)
  const updated = object.slice(prefix.length)
  if (updated === original) return code
  const start = first ? entry.start + first.start - prefix.length : entry.end - 1
  const end = first ? entry.start + first.end - prefix.length : start
  return code.slice(0, start) + updated + code.slice(end)
}
