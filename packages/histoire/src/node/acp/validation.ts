import type { UiAgentSettings } from '@histoire/shared'
import type { AcpSettingsOverrides } from './types.js'
import { Buffer } from 'node:buffer'
import { z } from 'zod'

/** Secret-free launch definition accepted from explicit local settings actions. */
const presetSchema = z.object({
  id: z.string().regex(/^[\w-]{1,80}$/).refine(value => !['__proto__', 'constructor', 'prototype'].includes(value)),
  name: z.string().min(1).max(120),
  command: z.string().min(1).max(2048).refine(value => !/[\r\n\0]/.test(value)),
  args: z.array(z.string().max(2048)).max(64).optional(),
  cwd: z.string().max(2048).optional(),
  default: z.boolean().optional(),
}).strict()

/** Runtime settings validator strips snapshot-only fields while rejecting env. */
const settingsSchema = z.object({
  enabled: z.boolean(),
  enabledIds: z.array(z.string().max(80)).max(32),
  presets: z.array(presetSchema).max(32),
  permissions: z.object({ fileEdits: z.enum(['ask', 'allow-src', 'never']).optional(), terminal: z.enum(['ask', 'allow', 'never']).optional() }).strict(),
  context: z.object({ exposeMcp: z.boolean(), attachScreenshot: z.boolean(), includeSource: z.boolean(), askEachTime: z.boolean() }).strict(),
})

/** Validates user commands and opt-ins before any persistence or process launch. */
export function validateAgentSettings(value: unknown): UiAgentSettings {
  const result = settingsSchema.parse(value)
  if (Buffer.byteLength(JSON.stringify(result)) > 32 * 1024) throw new Error('Agent preferences are too large')
  const ids = result.presets.map(item => item.id)
  if (new Set(ids).size !== ids.length || result.enabledIds.some(id => !ids.includes(id))) throw new Error('Invalid agent preset identities')
  if (result.presets.filter(item => item.default).length > 1) throw new Error('Choose one default agent')
  return result
}

/** Validate partial persisted intent without supplying inherited default fields. */
export function validateAgentOverrides(value: unknown): AcpSettingsOverrides {
  const result = settingsSchema.partial().extend({ context: settingsSchema.shape.context.partial().optional() }).strict().parse(value)
  if (Buffer.byteLength(JSON.stringify(result)) > 32 * 1024) throw new Error('Agent preferences are too large')
  if (result.presets && new Set(result.presets.map(item => item.id)).size !== result.presets.length) throw new Error('Invalid agent preset identities')
  return result
}

/** Write-only credential validation; no raw values appear in error messages. */
export function validateAgentEnvironment(value: unknown): { agentId: string, env: Record<string, string> } {
  const result = z.object({ agentId: z.string().regex(/^[\w-]{1,80}$/), env: z.record(z.string().max(120).regex(/^[a-z_]\w*$/i), z.string().max(16000)) }).strict().safeParse(value)
  if (!result.success || Object.keys(result.data.env).length > 64) throw new Error('Invalid agent environment')
  return result.data
}
