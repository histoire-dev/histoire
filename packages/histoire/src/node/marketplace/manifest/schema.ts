import type { HistoireJsonValue } from '@histoire/protocol'
import { z } from 'zod'

/** Bounded nonempty descriptive text. */
const text = z.string().min(1).max(500)
/** Prototype-sensitive paths never reach config editing. */
const forbidden = new Set(['__proto__', 'prototype', 'constructor'])
/** Accept only ordinary identifiers in declarative object paths. */
export const optionPath = text.refine(value => value.split('.').every(part => /^[a-z_$][\w$]*$/i.test(part) && !forbidden.has(part)), 'Invalid option path')
/** JSON object keys cannot mutate object prototypes. */
const safeKey = text.refine(value => !forbidden.has(value), 'Invalid object key')
/** JSON strings may be empty, but cannot carry unbounded form defaults. */
const json: z.ZodType<HistoireJsonValue> = z.lazy(() => z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null(), z.array(json), z.record(safeKey, json)]))
/** Allowed catalog categories. */
export const categories = ['testing', 'design', 'inspection', 'frameworks', 'data'] as const
/** Allowed tile tints. */
export const tints = ['green', 'violet', 'blue', 'amber', 'rose', 'sky', 'slate'] as const
/** Extension contribution categories supported by this milestone. */
export const addKinds = ['rail-pane', 'inspector-tab', 'toolbar-tool', 'story-tests', 'cli-command', 'settings-section', 'canvas-view'] as const
/** Declared access categories, never runtime grants. */
export const accessKinds = ['story-frames', 'story-dom', 'network', 'filesystem', 'child-process'] as const

/** Fields shared across all option controls. */
const optionBase = z.object({ key: optionPath, label: text, description: text.optional(), when: z.record(optionPath, json).optional() })
/** Individual option, including a default of the correct control type. */
export const optionSchema = z.discriminatedUnion('type', [
  optionBase.extend({ type: z.literal('boolean'), default: z.boolean().optional() }).strict(),
  optionBase.extend({ type: z.literal('string'), default: z.string().max(500).optional() }).strict(),
  optionBase.extend({ type: z.literal('string-list'), default: z.array(z.string().max(500)).optional() }).strict(),
  optionBase.extend({ type: z.literal('enum'), display: z.enum(['select', 'segmented']).optional(), choices: z.array(z.strictObject({ value: text, label: text })).min(1), default: text.optional() }).strict(),
]).superRefine((option, ctx) => {
  if (option.type !== 'enum') return
  const values = option.choices.map(choice => choice.value)
  if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path: ['choices'], message: 'Duplicate enum value' })
  if (option.default !== undefined && !values.includes(option.default)) ctx.addIssue({ code: 'custom', path: ['default'], message: 'Default is not an enum choice' })
})
/** Atomic migration: a malformed operation invalidates the whole migration. */
const migration = z.strictObject({ from: text, ops: z.array(z.discriminatedUnion('op', [
  z.strictObject({ op: z.literal('rename-option'), from: optionPath, to: optionPath }),
  z.strictObject({ op: z.literal('remove-option'), path: optionPath }),
  z.strictObject({ op: z.literal('set-option'), path: optionPath, value: json }),
])).min(1) })
/** Strict manifest schema; validation recovers optional fields and array items. */
export const manifestSchema = z.strictObject({
  displayName: text.max(40),
  summary: text.max(160),
  category: z.enum(categories),
  frameworks: z.array(text).optional(),
  requires: z.record(safeKey, text).optional(),
  monogram: text,
  tint: z.enum(tints),
  logoUrl: z.url({ protocol: /^https$/ }).max(500).optional(),
  adds: z.array(z.strictObject({ kind: z.enum(addKinds), text, contribution: z.string().regex(/^[^\s:]+$/).optional() })).optional(),
  access: z.array(z.enum(accessKinds)).optional(),
  config: z.strictObject({ import: text.regex(/^[a-z_$][\w$]*$/i), options: z.array(optionSchema).optional() }),
  recommend: z.array(z.union([
    z.strictObject({ dependency: text, reason: text }),
    z.strictObject({ missing: z.literal(true), reason: text }),
  ])).optional(),
  collections: z.array(text).optional(),
  releaseNotes: z.array(z.strictObject({ kind: z.enum(['breaking', 'feature', 'fix']), text, code: z.array(z.string().max(500)).optional() })).optional(),
  migrations: z.array(migration).optional(),
})
