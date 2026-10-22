import type { UiAgentElicitationField, UiAgentElicitationValue } from './types/ui-agent-elicitation.js'

/** Outcome of validating submitted elicitation content against its fields. */
export type ElicitationValidation
  = | { content: Record<string, UiAgentElicitationValue> }
    | { errors: Record<string, string> }

/** Longest accepted text value when the agent sets no maximum. */
const TEXT_LIMIT = 8192

/** Loose structural checks for ACP string formats. */
const FORMATS: Record<NonNullable<Extract<UiAgentElicitationField, { type: 'text' }>['format']>, (value: string) => boolean> = {
  'email': value => /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(value),
  'uri': (value) => {
    try {
      return Boolean(new URL(value))
    }
    catch {
      return false
    }
  },
  'date': value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)),
  'date-time': value => /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)),
}

/**
 * Tests an agent-provided pattern; an invalid expression never blocks the user.
 * @param pattern Agent regular expression source.
 * @param value Submitted text.
 */
function matches(pattern: string, value: string): boolean {
  try {
    return new RegExp(pattern, 'u').test(value)
  }
  catch {
    return true
  }
}

/** Whether a submitted value counts as left empty. */
function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

/**
 * Checks one non-empty value, returning an error message or the normalized value.
 * @param field Projected field.
 * @param value Submitted value.
 */
function check(field: UiAgentElicitationField, value: unknown): { error: string } | { value: UiAgentElicitationValue } {
  switch (field.type) {
    case 'text': {
      if (typeof value !== 'string') return { error: 'Enter text' }
      if (value.length < (field.minLength ?? 0)) return { error: `Use at least ${field.minLength} characters` }
      if (value.length > Math.min(field.maxLength ?? TEXT_LIMIT, TEXT_LIMIT)) return { error: `Use at most ${Math.min(field.maxLength ?? TEXT_LIMIT, TEXT_LIMIT)} characters` }
      if (field.format && !FORMATS[field.format](value)) return { error: `Enter a valid ${field.format}` }
      if (field.pattern && !matches(field.pattern, value)) return { error: 'Value has an unexpected format' }
      return { value }
    }
    case 'choice':
      return typeof value === 'string' && field.options.some(option => option.value === value) ? { value } : { error: 'Pick one of the options' }
    case 'multi-choice': {
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !field.options.some(option => option.value === item))) return { error: 'Pick from the options' }
      const unique = [...new Set(value as string[])]
      if (unique.length < (field.minItems ?? 0)) return { error: `Pick at least ${field.minItems}` }
      if (field.maxItems !== undefined && unique.length > field.maxItems) return { error: `Pick at most ${field.maxItems}` }
      return { value: unique }
    }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return { error: 'Enter a number' }
      if (field.integer && !Number.isInteger(value)) return { error: 'Enter a whole number' }
      if (field.minimum !== undefined && value < field.minimum) return { error: `Use ${field.minimum} or more` }
      if (field.maximum !== undefined && value > field.maximum) return { error: `Use ${field.maximum} or less` }
      return { value }
    case 'boolean':
      return typeof value === 'boolean' ? { value } : { error: 'Choose yes or no' }
  }
}

/**
 * Validates browser-submitted values against projected elicitation fields.
 * Shared by the form (inline errors) and the server (trust boundary before the agent).
 * Unknown keys are dropped and empty optional values omitted.
 * @param fields Projected form fields.
 * @param content Submitted values.
 */
export function validateElicitationContent(fields: readonly UiAgentElicitationField[], content: unknown): ElicitationValidation {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return { errors: { '': 'Invalid form content' } }
  const input = content as Record<string, unknown>
  const valid: Record<string, UiAgentElicitationValue> = {}
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const value = Object.hasOwn(input, field.key) ? input[field.key] : undefined
    if (isEmpty(value)) {
      if (field.required) errors[field.key] = 'Required'
      continue
    }
    const result = check(field, value)
    if ('error' in result) errors[field.key] = result.error
    else valid[field.key] = result.value
  }
  return Object.keys(errors).length ? { errors } : { content: valid }
}
