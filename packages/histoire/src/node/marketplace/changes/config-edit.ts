import type { ChangeRequest, MarketplaceManifest } from '@histoire/shared'
import type { ArrayNode, PropertyNode } from '../../config/codemod/types.js'
import { locateConfigObject } from '../../config/codemod/locate.js'
import { parseConfigCode, unwrapNode } from '../../config/codemod/parse.js'
import { appendEntry, applySourceEdits, printValue, removeProperty } from '../../config/codemod/source-edit.js'
import { findProperty } from '../../config/codemod/walk.js'
import { analyzePluginSource } from '../../config/plugin-toggle-source.js'
import { ensureFactoryImport, factoryImports, removeUnusedFactoryImport } from './imports.js'
import { editOptionsObject } from './options-edit.js'
import { optionEdits, pluginOptions } from './options.js'

/** Subset needed by the pure editor; no preferences, filesystem or package code. */
export type ConfigChange = Pick<ChangeRequest, 'kind' | 'id' | 'options'>

/** Finds a literal plugins array, creating an empty one only when safely absent. */
function pluginArray(code: string, create = true): { /** Updated source. */ code: string, /** Parsed array, absent for removal with no plugins key. */ array?: ArrayNode } {
  let parsed = parseConfigCode(code)
  let config = locateConfigObject(parsed)
  if (config.issue || !config.object) throw new Error('Unsupported plugin config')
  let found = findProperty(config.object, 'plugins')
  if (found.issue) throw new Error('Unsupported plugin array')
  if (!found.property) {
    if (!create) return { code }
    code = applySourceEdits(code, appendEntry(parsed, config.object, 'plugins: []'))
    parsed = parseConfigCode(code)
    config = locateConfigObject(parsed)
    found = findProperty(config.object, 'plugins')
  }
  const array = unwrapNode(found.property.value)
  if (array.type !== 'ArrayExpression') throw new Error('Unsupported plugin array')
  // Reuse toggle analysis: arbitrary spreads, holes and conditional calls fail.
  analyzePluginSource(code)
  return { code, array }
}

/** Patches only schema-owned paths inside the first literal object argument. */
function editCall(expression: string, schema: MarketplaceManifest['config'], values: ChangeRequest['options']): string {
  const statement = parseConfigCode(`export default ${expression}`).program.body[0]
  if (statement.type !== 'ExportDefaultDeclaration') throw new Error('Unsupported plugin call')
  const call = unwrapNode(statement.declaration)
  if (call.type !== 'CallExpression') throw new Error('Unsupported plugin call')
  const edits = optionEdits(schema.options ?? [], values)
  if (!edits.length) return expression
  const first = call.arguments[0]
  if (first && unwrapNode(first).type !== 'ObjectExpression') throw new Error('Plugin options must be an object literal')
  const prefix = 'export default '
  // Reuse settings' path editor on a synthetic export. It preserves unrelated
  // properties, callbacks, comments and nested siblings in the actual argument.
  let object = prefix + (first ? `export default ${expression}`.slice(first.start, first.end) : '{}')
  for (const [path, value] of edits) object = editOptionsObject(object, path, value)
  const printed = object.slice(prefix.length)
  if (!first) {
    if (!Object.keys(pluginOptions(schema.options ?? [], values)).length) return expression
    const end = expression.lastIndexOf(')')
    return `${expression.slice(0, end)}${printed}${expression.slice(end)}`
  }
  return expression.slice(0, first.start - prefix.length) + printed + expression.slice(first.end - prefix.length)
}

/** Produces checked minimal source edits; never evaluates or writes project code. */
export function editPluginConfig(input: string, request: ConfigChange, manifest: MarketplaceManifest): string {
  let { code, array } = pluginArray(input, request.kind !== 'remove')
  const aliases = factoryImports(code, request.id, manifest.config.import)
  let local = aliases[0]
  if (!array) return aliases.reduce((source, alias) => removeUnusedFactoryImport(source, request.id, alias), code)
  const entries = analyzePluginSource(code)
  /** Reads each direct call's imported local identity without executing it. */
  const identity = (expression: string): string => {
    const parsed = parseConfigCode(`export default ${expression}`)
    const statement = parsed.program.body[0]
    const node = statement.type === 'ExportDefaultDeclaration' ? unwrapNode(statement.declaration) : undefined
    if (node?.type !== 'CallExpression' || node.callee.type !== 'Identifier') throw new Error('Unsupported plugin call')
    return node.callee.name
  }
  const selected = entries.filter(entry => aliases.includes(identity(entry.expression)))
  if (selected.length > 1) throw new Error('Plugin configured more than once')
  const entry = selected[0]
  if (entry) local = identity(entry.expression)
  if (request.kind === 'remove') {
    if (entry) {
      const parsed = parseConfigCode(code)
      // removeProperty uses only source spans and comma trivia, also valid for
      // array expressions; no reprint of the remaining plugin calls is needed.
      code = applySourceEdits(code, [removeProperty(parsed, array.elements[entries.indexOf(entry)] as unknown as PropertyNode)])
    }
    for (const alias of aliases) code = removeUnusedFactoryImport(code, request.id, alias)
  }
  else if (entry) {
    if (request.options) {
      if (!entry.enabled) throw new Error('Disabled plugin options require a manual edit')
      const expression = editCall(entry.expression, manifest.config, request.options)
      code = code.slice(0, entry.start) + expression + code.slice(entry.end)
    }
  }
  else {
    if (request.kind !== 'install') throw new Error('Plugin call is not configured')
    const imported = ensureFactoryImport(code, request.id, manifest.config.import)
    code = imported.code
    local = imported.local
    array = pluginArray(code).array
    const options = pluginOptions(manifest.config.options ?? [], request.options)
    const expression = `${local}(${Object.keys(options).length ? printValue(code, options) : ''})`
    code = applySourceEdits(code, appendEntry(parseConfigCode(code), array, expression))
  }
  const actual = analyzePluginSource(code).map(item => identity(item.expression))
  const expected = entries.filter(item => request.kind !== 'remove' || item !== entry).map(item => identity(item.expression))
  if (!entry && request.kind === 'install') expected.push(local)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Plugin identity order changed')
  return code
}
