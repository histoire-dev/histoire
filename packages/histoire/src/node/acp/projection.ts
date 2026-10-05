import type { UiAgentSettings, UiAgentStatus } from '@histoire/shared'
import { Buffer } from 'node:buffer'

/** Keeps serialized public text beneath the UI channel budget, including escapes. */
export function projectAgentStatuses(settings: UiAgentSettings, statuses: Map<string, UiAgentStatus>, environment: Record<string, Record<string, string>>, sanitize: (text: string) => string): UiAgentStatus[] {
  const identities = settings.presets.map(({ id, name }) => ({ id, name }))
  let budget = Math.max(0, Math.min(14_000, 60_000 - Buffer.byteLength(JSON.stringify(settings)) - Buffer.byteLength(JSON.stringify(identities))))
  /** Allocates one safe string from a shared serialized-string budget. */
  function text(value: string, maximum = 2048): string {
    value = sanitize(value).slice(-maximum)
    while (value && Buffer.byteLength(JSON.stringify(value)) > budget) value = value.slice(Math.ceil(value.length / 2))
    budget = Math.max(0, budget - Buffer.byteLength(JSON.stringify(value)))
    return value
  }
  return settings.presets.map((preset) => {
    const status = statuses.get(preset.id)
    const enabled = settings.enabled && settings.enabledIds.includes(preset.id)
    return {
      id: preset.id,
      name: preset.name,
      state: enabled ? status?.state ?? 'idle' : 'disabled',
      enabled,
      error: status?.error ? text(status.error) : undefined,
      logs: (status?.logs ?? []).slice(-30).map(line => text(line)).filter(Boolean),
      envKeys: Object.keys(environment[preset.id] ?? {}).map(key => text(key, 120)).filter(Boolean),
    }
  })
}
