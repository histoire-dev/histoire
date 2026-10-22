import type { UiAgentElicitationChoiceField, UiAgentElicitationField, UiAgentElicitationMultiChoiceField, UiAgentElicitationTextField } from '@histoire/shared'

/** Choice field rendered as an option list. */
export type ElicitationChoiceField = UiAgentElicitationChoiceField | UiAgentElicitationMultiChoiceField

/** One rendered form row: a field plus the free-text field folded into its option list. */
export interface ElicitationRow {
  /** Field shown by this row. */
  field: UiAgentElicitationField
  /** `<key>_custom` text field shown as an "Other…" option of a choice field. */
  custom?: UiAgentElicitationTextField
}

/** Suffix agents (Claude Code AskUserQuestion) use for the free-text answer of a question. */
const CUSTOM_SUFFIX = '_custom'

/** Single choices with more options than this collapse into a dropdown. */
const COMPACT_OVER = 8

/** Trailing recommendation marker in an option label. */
const RECOMMENDED = /\s*\(recommended\)\s*$/i

/**
 * Whether a field renders as a dropdown instead of an option list.
 * @param field Projected form field.
 */
export function isCompact(field: UiAgentElicitationField): boolean {
  return field.type === 'choice' && field.options.length > COMPACT_OVER
}

/**
 * Groups fields into rows, folding each `<choiceKey>_custom` text field into its choice field.
 * Dropdown choices keep their text field separate. The folded field keeps its own key so submitted content still matches the shared validator.
 * @param fields Projected form fields in agent order.
 */
export function foldCustomFields(fields: readonly UiAgentElicitationField[]): ElicitationRow[] {
  const byKey = new Map(fields.map(field => [field.key, field]))
  /** Choice field that owns a text field, if any. */
  const ownerOf = (field: UiAgentElicitationField) => {
    if (field.type !== 'text' || !field.key.endsWith(CUSTOM_SUFFIX)) return undefined
    const owner = byKey.get(field.key.slice(0, -CUSTOM_SUFFIX.length))
    return owner && (owner.type === 'choice' || owner.type === 'multi-choice') && !isCompact(owner) ? owner : undefined
  }
  const folded = new Map<string, UiAgentElicitationTextField>()
  for (const field of fields) {
    const owner = ownerOf(field)
    if (owner) folded.set(owner.key, field as UiAgentElicitationTextField)
  }
  return fields.filter(field => !ownerOf(field)).map(field => ({ field, custom: folded.get(field.key) }))
}

/**
 * Splits a trailing "(Recommended)" marker off an option label so it can render as a badge.
 * @param label Agent option label.
 */
export function parseOptionLabel(label: string): { text: string, recommended: boolean } {
  return RECOMMENDED.test(label) ? { text: label.replace(RECOMMENDED, ''), recommended: true } : { text: label, recommended: false }
}

/**
 * Visible field name with the key as fallback.
 * @param field Projected form field.
 */
export function fieldTitle(field: UiAgentElicitationField): string {
  return field.title ?? field.key
}
