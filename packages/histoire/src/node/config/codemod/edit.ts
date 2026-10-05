import type { ConfigAccessOptions, ConfigPatch, JsonValue } from './types.js'
import { readFile } from 'node:fs/promises'
import { locateConfigObject } from './locate.js'
import { parseConfigCode } from './parse.js'
import { assertConfigPatches, parseConfigPath } from './paths.js'
import { guardConfigFile } from './security.js'
import { appendEntry, applySourceEdits, printValue, removeProperty } from './source-edit.js'
import { missingValue, printKey, updateValue } from './update.js'
import { verifyConfigEdits } from './verify.js'
import { locateConfigPath, staticValue } from './walk.js'
import { hashConfigCode } from './write.js'

/** Produces minimal source edits; disk writes require an explicit writeConfig call. */
export async function editConfig(file: string, patches: ConfigPatch[], options: ConfigAccessOptions = {}): Promise<{ code: string, changed: string[], hash: string }> {
  assertConfigPatches(patches)
  const safe = await guardConfigFile(file, options)
  const original = await readFile(safe, 'utf8')
  let code = original
  const changed: string[] = []
  for (const patch of patches) {
    const next = editConfigCode(code, patch)
    if (next !== code && !changed.includes(patch.path)) changed.push(patch.path)
    code = next
  }
  // Always parse final output before returning a preview to the writer.
  parseConfigCode(code)
  verifyConfigEdits(original, code, patches)
  return { code, changed, hash: hashConfigCode(original) }
}

/** Applies one validated patch, reparsing between patches to keep offsets exact. */
export function editConfigCode(code: string, patch: ConfigPatch): string {
  const parsed = parseConfigCode(code)
  const config = locateConfigObject(parsed)
  if (config.issue) throw new Error(config.issue.reason)
  const result = locateConfigPath(parsed, config.object, parseConfigPath(patch.path))
  if (result.issue) throw new Error(result.issue.reason)
  if (result.missing) {
    if (patch.value === undefined) return code
    const first = result.missing[0]
    let entry: string
    if (typeof first === 'string') {
      entry = `${printKey(code, first)}: ${printValue(code, missingValue(result.missing.slice(1), patch.value))}`
    }
    else {
      const value = missingValue(result.missing, patch.value) as JsonValue[]
      entry = printValue(code, value[0])
    }
    return applySourceEdits(code, appendEntry(parsed, result.parent, entry))
  }
  const staticResult = staticValue(parsed, result.node)
  if (staticResult.issue) throw new Error(staticResult.issue.reason)
  if (patch.value === undefined) {
    if (result.property) return applySourceEdits(code, [removeProperty(parsed, result.property)])
    // Removing a keyed array item replaces just this literal array; object-key
    // removal does not risk an invalid array hole or comma placement.
    if (result.parent?.type === 'ArrayExpression') {
      const value = staticValue(parsed, result.parent).value as JsonValue[]
      const index = result.parent.elements.indexOf(result.node as never)
      return applySourceEdits(code, updateValue(parsed, result.parent, value.filter((_, item) => item !== index)))
    }
    throw new Error('Cannot remove the config root')
  }
  return applySourceEdits(code, updateValue(parsed, result.node, patch.value))
}
