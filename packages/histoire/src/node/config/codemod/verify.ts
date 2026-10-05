import type { ConfigPatch, JsonValue, ParsedConfig, PathToken } from './types.js'
import { locateConfigObject } from './locate.js'
import { assertSharedInitializerOwnership } from './ownership.js'
import { parseConfigCode } from './parse.js'
import { CONFIG_EDITABLE_PATHS, parseConfigPath } from './paths.js'
import { equalValue } from './update.js'
import { locateConfigPath, staticValue } from './walk.js'

/** Static value retained for one source path before an edit. */
interface TrackedValue {
  /** Parsed allowlisted path. */
  tokens: PathToken[]
  /** Value before applying the patch collection. */
  value: JsonValue
}

/** Ensures final source preserves aliases outside the requested patch values. */
export function verifyConfigEdits(original: string, code: string, patches: ConfigPatch[]): void {
  const originalParsed = parseConfigCode(original)
  const before = snapshotEditableValues(originalParsed)
  const parsed = parseConfigCode(code)
  const after = new Map(snapshotEditableValues(parsed).map(value => [pathKey(value.tokens), value.value]))
  for (const entry of before) {
    const expected = expectedValue(entry, patches)
    if (expected.skip) continue
    const actual = after.get(pathKey(entry.tokens))
    if (expected.value === undefined ? actual !== undefined : actual === undefined || !equalValue(actual, expected.value)) {
      throw new Error('Config edit changes a retained config value through a shared initializer')
    }
  }
  assertSharedInitializerOwnership(originalParsed, parsed, patches)
  assertPatchedValues(parsed, finalVerificationPatches(patches))
}

/** Keeps only final overlapping intents because edits apply sequentially. */
function finalVerificationPatches(patches: ConfigPatch[]): ConfigPatch[] {
  return patches.filter((patch, index) => !patches.slice(index + 1).some((later) => {
    const current = parseConfigPath(patch.path)
    const next = parseConfigPath(later.path)
    return startsWith(current, next) || startsWith(next, current)
  }))
}

/** Captures static writable values, including every existing keyed preset field. */
function snapshotEditableValues(parsed: ParsedConfig): TrackedValue[] {
  const config = locateConfigObject(parsed)
  if (!config.object || config.issue) throw new Error(config.issue?.reason ?? 'Config must be an object literal')
  const values: TrackedValue[] = []
  for (const path of CONFIG_EDITABLE_PATHS) addValue(parsed, config.object, parseConfigPath(path), values)
  const presets = values.find(value => pathKey(value.tokens) === 'agents.presets')?.value
  if (!Array.isArray(presets)) return values
  for (const preset of presets) {
    if (!preset || Array.isArray(preset) || typeof preset !== 'object' || typeof preset.id !== 'string') continue
    for (const field of ['id', 'name', 'command', 'args', 'cwd', 'default']) {
      addValue(parsed, config.object, ['agents', 'presets', { id: preset.id }, field], values)
    }
  }
  return values
}

/** Adds an existing static config value without refusing unrelated computed fields. */
function addValue(parsed: ParsedConfig, object: NonNullable<ReturnType<typeof locateConfigObject>['object']>, tokens: PathToken[], values: TrackedValue[]): void {
  const located = locateConfigPath(parsed, object, tokens)
  if (located.issue || !located.node) return
  const decoded = staticValue(parsed, located.node)
  if (!decoded.issue && decoded.value !== undefined) values.push({ tokens, value: decoded.value })
}

/** Verifies every non-removal patch against final static source semantics. */
function assertPatchedValues(parsed: ParsedConfig, patches: ConfigPatch[]): void {
  const config = locateConfigObject(parsed)
  if (!config.object || config.issue) throw new Error(config.issue?.reason ?? 'Config must be an object literal')
  for (const patch of patches) {
    const located = locateConfigPath(parsed, config.object, parseConfigPath(patch.path))
    if (patch.value === undefined) {
      if (located.node && !located.missing) throw new Error('Config edit did not remove requested value')
      continue
    }
    if (located.issue || !located.node) throw new Error(located.issue?.reason ?? 'Config edit did not produce requested effective value')
    const decoded = staticValue(parsed, located.node)
    if (decoded.issue || decoded.value === undefined || !equalValue(decoded.value, patch.value)) {
      throw new Error('Config edit did not produce requested effective value')
    }
  }
}

/** Computes expected retained value unless a deeper patch needs separate checking. */
function expectedValue(entry: TrackedValue, patches: ConfigPatch[]): { value?: JsonValue, skip: boolean } {
  const relevant = patches.findLast((patch) => {
    const tokens = parseConfigPath(patch.path)
    return startsWith(tokens, entry.tokens) || startsWith(entry.tokens, tokens)
  })
  if (!relevant) return { value: entry.value, skip: false }
  const tokens = parseConfigPath(relevant.path)
  if (startsWith(tokens, entry.tokens) && tokens.length > entry.tokens.length) return { skip: true }
  return { value: valueAt(relevant.value, entry.tokens.slice(tokens.length)), skip: false }
}

/** Reads one static path fragment from a JSON patch value. */
function valueAt(value: JsonValue | undefined, tokens: PathToken[]): JsonValue | undefined {
  let current = value
  for (const token of tokens) {
    if (typeof token === 'string') {
      current = current && !Array.isArray(current) && typeof current === 'object' ? current[token] : undefined
    }
    else {
      current = Array.isArray(current) ? current.find(item => item && !Array.isArray(item) && typeof item === 'object' && item.id === token.id) : undefined
    }
  }
  return current
}

/** Compares paths without relying on their display serialization. */
function startsWith(left: PathToken[], right: PathToken[]): boolean {
  return left.length >= right.length && right.every((token, index) => typeof token === 'string' ? token === left[index] : typeof left[index] !== 'string' && left[index].id === token.id)
}

/** Builds collision-free keys for a map of known editable paths. */
function pathKey(tokens: PathToken[]): string {
  return tokens.map(token => typeof token === 'string' ? `.${token}` : `[${token.id}]`).join('').slice(1)
}
