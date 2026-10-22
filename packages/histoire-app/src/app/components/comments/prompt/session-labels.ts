import type { UiAgentConfigSelector, UiCommentSessionOptions } from '@histoire/shared'

/** Session option fields shown in the session settings, in display order. */
export type SessionField = keyof UiCommentSessionOptions

/**
 * Value in effect for one selector: the explicit choice, else the agent's current value.
 * @param selector Agent-advertised choices.
 * @param value Explicit choice.
 */
export function sessionValue(selector: UiAgentConfigSelector | undefined, value: string | undefined): string | undefined {
  return value ?? selector?.currentValue
}

/**
 * Display label of the value in effect for one selector; none before the agent advertised its choices.
 * @param selector Agent-advertised choices.
 * @param value Explicit choice.
 */
export function sessionLabel(selector: UiAgentConfigSelector | undefined, value: string | undefined): string | undefined {
  if (!selector) return undefined
  const current = sessionValue(selector, value)
  return selector.options.find(option => option.value === current)?.label ?? current
}

/**
 * Next choices after picking one value; a new model resets effort, whose levels depend on the model.
 * @param options Current explicit choices.
 * @param field Picked field.
 * @param value Picked value.
 */
export function pickSessionOption(options: UiCommentSessionOptions | undefined, field: SessionField, value: string): UiCommentSessionOptions {
  const next = { ...options, [field]: value }
  if (field === 'model') delete next.effort
  return next
}
