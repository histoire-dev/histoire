import type { HistoireJsonValue } from '@histoire/protocol'
import { locateConfigObject } from '../../config/codemod/locate.js'
import { parseConfigCode } from '../../config/codemod/parse.js'
import { appendEntry, applySourceEdits, printValue, removeProperty } from '../../config/codemod/source-edit.js'
import { missingValue, printKey, updateValue } from '../../config/codemod/update.js'
import { locateConfigPath, staticValue } from '../../config/codemod/walk.js'
import { optionPath } from '../manifest/schema.js'

/** Applies a safe option path to a synthetic default-exported literal object. */
export function editOptionsObject(code: string, path: string, value: HistoireJsonValue | undefined): string {
  optionPath.parse(path)
  const parsed = parseConfigCode(code)
  const config = locateConfigObject(parsed)
  if (config.issue || !config.object) throw new Error('Plugin options must be an object literal')
  const result = locateConfigPath(parsed, config.object, path.split('.'))
  if (result.issue) throw new Error(result.issue.reason)
  if (result.missing) {
    if (value === undefined) return code
    const entry = `${printKey(code, result.missing[0] as string)}: ${printValue(code, missingValue(result.missing.slice(1), value))}`
    return applySourceEdits(code, appendEntry(parsed, result.parent, entry))
  }
  const literal = staticValue(parsed, result.node)
  if (literal.issue) throw new Error(literal.issue.reason)
  if (value === undefined) {
    if (!result.property) throw new Error('Cannot remove plugin options root')
    return applySourceEdits(code, [removeProperty(parsed, result.property)])
  }
  return applySourceEdits(code, updateValue(parsed, result.node, value))
}
