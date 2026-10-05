import type { UiAgentSettings } from '@histoire/shared'
import type { AcpManagerOptions, AcpSettingsOverrides } from './types.js'
import { isDeepStrictEqual } from 'node:util'
import { ACP_PRESETS } from './presets.js'
import { validateAgentSettings } from './validation.js'

/** Fresh project defaults never inherit unrelated local snapshot fields. */
export function defaultAgentSettings(config?: AcpManagerOptions['config']): UiAgentSettings {
  const presets = config?.presets?.length ? config.presets : ACP_PRESETS
  return validateAgentSettings({ enabled: config?.enabled === true, enabledIds: config?.enabled ? presets.map(item => item.id) : [], presets: presets.map(({ id, name, command, args, cwd, default: isDefault }) => ({ id, name, command, ...(args === undefined ? {} : { args }), ...(cwd === undefined ? {} : { cwd }), ...(isDefault === undefined ? {} : { default: isDefault }) })), permissions: { fileEdits: 'ask', terminal: 'ask', ...config?.permissions }, context: { exposeMcp: true, attachScreenshot: true, includeSource: true, askEachTime: false } })
}

/** Merge only deliberate fields; removed presets cannot retain stale enabled identities. */
export function mergeAgentSettings(defaults: UiAgentSettings, overrides: AcpSettingsOverrides = {}): UiAgentSettings {
  const merged = { ...defaults, ...overrides, permissions: { ...defaults.permissions, ...overrides.permissions }, context: { ...defaults.context, ...overrides.context } }
  const ids = new Set(merged.presets.map(preset => preset.id))
  return validateAgentSettings({ ...merged, enabledIds: merged.enabledIds.filter(id => ids.has(id)) })
}

/** Record changed fields against current defaults; an explicit reset removes that field. */
export function updateAgentOverrides(defaults: UiAgentSettings, previous: UiAgentSettings, next: UiAgentSettings, saved: AcpSettingsOverrides = {}): AcpSettingsOverrides {
  const result = structuredClone(saved)
  for (const field of ['enabled', 'enabledIds', 'presets'] as const) {
    if (isDeepStrictEqual(previous[field], next[field])) continue
    if (isDeepStrictEqual(defaults[field], next[field])) delete result[field]
    else Object.assign(result, { [field]: structuredClone(next[field]) })
  }
  for (const group of ['permissions', 'context'] as const) {
    const changes: Record<string, unknown> = { ...result[group] }
    for (const field of new Set([...Object.keys(previous[group]), ...Object.keys(next[group])])) {
      const before = previous[group] as unknown as Record<string, unknown>
      const after = next[group] as unknown as Record<string, unknown>
      const baseline = defaults[group] as unknown as Record<string, unknown>
      if (before[field] === after[field]) continue
      if (baseline[field] === after[field]) delete changes[field]
      else changes[field] = after[field]
    }
    if (Object.keys(changes).length) Object.assign(result, { [group]: changes })
    else delete result[group]
  }
  return result
}

/** Retire matching submitted values only; later local edits keep their field ownership. */
export function retireAgentOverrides(saved: AcpSettingsOverrides, paths: readonly string[], current: UiAgentSettings, project: UiAgentSettings, reset = false): AcpSettingsOverrides {
  const result = structuredClone(saved)
  if (paths.includes('agents.presets') && (reset || isDeepStrictEqual(current.presets, project.presets))) delete result.presets
  if (paths.includes('agents.permissions')) {
    const permissions = { ...result.permissions }
    for (const field of ['fileEdits', 'terminal'] as const) {
      if (reset || current.permissions[field] === project.permissions[field]) delete permissions[field]
    }
    if (Object.keys(permissions).length) result.permissions = permissions
    else delete result.permissions
  }
  return result
}
