import type { MarketplaceManifest, MarketplaceOption } from '@histoire/shared'
import type { z } from 'zod'
import { manifestSchema, optionSchema } from './schema.js'

/** Invalid metadata is diagnostic data, never an exception to the workbench. */
export interface ManifestDiagnostic {
  /** Dot path relative to histoire.marketplace. */ path: string
  /** Reason the field or item was dropped. */ message: string
}
/** Sanitized manifest and all dropped-field diagnostics. */
export interface ManifestValidation {
  /** Absent when required metadata is invalid. */ manifest: MarketplaceManifest | undefined
  /** Diagnostics in manifest traversal order. */ diagnostics: ManifestDiagnostic[]
}
/** Accept only plain JSON objects; package code is never inspected or executed. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
}
/** Retain precise source paths even when invalid array items are removed. */
function reportIssues(diagnostics: ManifestDiagnostic[], prefix: string, error: z.ZodError): void {
  for (const issue of error.issues) {
    const path = [prefix, ...issue.path].filter(part => part !== '').join('.')
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) diagnostics.push({ path: [path, key].filter(Boolean).join('.'), message: 'Unknown field' })
    }
    else {
      diagnostics.push({ path, message: issue.message })
    }
  }
}
/** Parse independently recoverable items without changing the caller's JSON. */
function parseItems<T>(value: unknown[], schema: z.ZodType<T>, path: string, diagnostics: ManifestDiagnostic[]): T[] {
  return value.flatMap((item, index) => {
    // A malformed optional relation must not discard otherwise useful descriptive metadata.
    if (path === 'adds' && isRecord(item) && item.contribution !== undefined) {
      const relation = manifestSchema.shape.adds.unwrap().element.shape.contribution.safeParse(item.contribution)
      if (!relation.success) {
        reportIssues(diagnostics, `${path}.${index}.contribution`, relation.error)
        const description = { ...item }
        delete description.contribution
        item = description
      }
    }
    const result = schema.safeParse(item)
    if (result.success) return [result.data]
    reportIssues(diagnostics, `${path}.${index}`, result.error)
    return []
  })
}
/** Remove duplicate/conflicting paths and invalid conditional dependencies. */
function validateOptions(value: unknown[], diagnostics: ManifestDiagnostic[]): MarketplaceOption[] {
  const candidates: Array<{ /** Parsed field. */ option: MarketplaceOption, /** Original diagnostic position. */ index: number }> = []
  for (const [index, item] of value.entries()) {
    const result = optionSchema.safeParse(item)
    if (!result.success) {
      reportIssues(diagnostics, `config.options.${index}`, result.error)
      continue
    }
    const option = result.data as MarketplaceOption
    if (candidates.some(({ option: previous }) => previous.key === option.key || previous.key.startsWith(`${option.key}.`) || option.key.startsWith(`${previous.key}.`))) {
      diagnostics.push({ path: `config.options.${index}.key`, message: 'Duplicate or overlapping option path' })
      continue
    }
    candidates.push({ option, index })
  }
  // Resolve references until stable: dropping a dependency also invalidates its consumers.
  let changed = true
  while (changed) {
    changed = false
    for (let index = candidates.length - 1; index >= 0; index--) {
      const candidate = candidates[index]
      for (const [key, value] of Object.entries(candidate.option.when ?? {})) {
        const dependency = candidates.find(item => item.option.key === key)?.option
        const matches = dependency && key !== candidate.option.key && optionSchema.safeParse({ ...dependency, default: value }).success
        if (!matches) {
          diagnostics.push({ path: `config.options.${candidate.index}.when.${key}`, message: 'Unknown option or invalid condition value' })
          candidates.splice(index, 1)
          changed = true
          break
        }
      }
    }
  }
  return candidates.map(candidate => candidate.option)
}
/** Best-effort validation: drop invalid optional data, reject invalid required data. */
export function validateMarketplaceManifest(value: unknown): ManifestValidation {
  const diagnostics: ManifestDiagnostic[] = []
  if (!isRecord(value)) return { manifest: undefined, diagnostics: [{ path: '', message: 'Expected a manifest object' }] }
  const output: Record<string, unknown> = {}
  let requiredInvalid = false
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(manifestSchema.shape, key)) diagnostics.push({ path: key, message: 'Unknown field' })
  }
  for (const [key, schema] of Object.entries(manifestSchema.shape)) {
    let input = value[key]
    if (key === 'config' && isRecord(input)) {
      const config: Record<string, unknown> = { import: input.import }
      for (const field of Object.keys(input)) {
        if (!Object.hasOwn(manifestSchema.shape.config.shape, field)) diagnostics.push({ path: `config.${field}`, message: 'Unknown field' })
      }
      if (Array.isArray(input.options)) {
        config.options = validateOptions(input.options, diagnostics)
      }
      else if (input.options !== undefined) {
        const result = manifestSchema.shape.config.shape.options.safeParse(input.options)
        if (!result.success) reportIssues(diagnostics, 'config.options', result.error)
      }
      input = config
    }
    // Array members are independently useful, except a migration's operations are atomic.
    if (Array.isArray(input) && 'unwrap' in schema) {
      const unwrapped = schema.unwrap()
      if ('element' in unwrapped) input = parseItems(input, unwrapped.element as z.ZodType, key, diagnostics)
    }
    const result = schema.safeParse(input)
    if (result.success) {
      if (result.data !== undefined) output[key] = result.data
    }
    else {
      reportIssues(diagnostics, key, result.error)
      if (!schema.isOptional()) requiredInvalid = true
    }
  }
  return { manifest: requiredInvalid ? undefined : output as unknown as MarketplaceManifest, diagnostics }
}
