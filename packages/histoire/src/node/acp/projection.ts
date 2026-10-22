import type { AvailableCommand } from '@agentclientprotocol/sdk'
import type { UiAgentCommand, UiAgentSettings, UiAgentStatus } from '@histoire/shared'
import { Buffer } from 'node:buffer'

/** Serialized snapshot budget, below the 64KB UI channel limit. */
const SNAPSHOT_BYTES = 60_000
/** Bytes of an empty `,"commands":[]` field. */
const COMMANDS_FIELD_BYTES = Buffer.byteLength(',"commands":[]')

/** Keeps serialized public text beneath the UI channel budget, including escapes. */
export function projectAgentStatuses(settings: UiAgentSettings, statuses: Map<string, UiAgentStatus>, environment: Record<string, Record<string, string>>, sanitize: (text: string) => string, commands = new Map<string, UiAgentCommand[]>()): UiAgentStatus[] {
  const identities = settings.presets.map(({ id, name }) => ({ id, name }))
  let budget = Math.max(0, Math.min(14_000, SNAPSHOT_BYTES - Buffer.byteLength(JSON.stringify(settings)) - Buffer.byteLength(JSON.stringify(identities))))
  /** Allocates one safe string from a shared serialized-string budget. */
  function text(value: string, maximum = 2048): string {
    value = sanitize(value).slice(-maximum)
    while (value && Buffer.byteLength(JSON.stringify(value)) > budget) value = value.slice(Math.ceil(value.length / 2))
    budget = Math.max(0, budget - Buffer.byteLength(JSON.stringify(value)))
    return value
  }
  const base = settings.presets.map((preset) => {
    const status = statuses.get(preset.id)
    const enabled = settings.enabled && settings.enabledIds.includes(preset.id)
    return {
      id: preset.id,
      name: preset.name,
      state: enabled ? status?.state ?? 'idle' : 'disabled',
      enabled,
      error: status?.error ? text(status.error) : undefined,
      warning: status?.warning ? text(status.warning) : undefined,
      logs: (status?.logs ?? []).slice(-30).map(line => text(line)).filter(Boolean),
      envKeys: Object.keys(environment[preset.id] ?? {}).map(key => text(key, 120)).filter(Boolean),
    } satisfies UiAgentStatus
  })
  // Commands get what is left of the shared snapshot budget after settings and statuses, at most 12KB,
  // so a long command list can neither crowd out errors nor push the snapshot over the channel limit.
  let commandBudget = Math.max(0, Math.min(12_000, SNAPSHOT_BYTES - Buffer.byteLength(JSON.stringify({ ...settings, agents: base }))))
  /** Keeps the leading commands that still fit the shared command budget, including JSON separators. */
  function fit(list: UiAgentCommand[] = []): UiAgentCommand[] | undefined {
    const kept: UiAgentCommand[] = []
    for (const command of list) {
      // Each entry costs its JSON plus a comma; the first also pays for the `,"commands":[]` field.
      const bytes = Buffer.byteLength(JSON.stringify(command)) + 1 + (kept.length ? 0 : COMMANDS_FIELD_BYTES)
      if (bytes > commandBudget) break
      commandBudget -= bytes
      kept.push(command)
    }
    return kept.length ? kept : undefined
  }
  return base.map(status => ({ ...status, commands: status.enabled ? fit(commands.get(status.id)) : undefined }))
}

/** Redacted, bounded slash commands from one ACP `available_commands_update`. */
export function projectAgentCommands(list: AvailableCommand[], sanitize: (text: string) => string): UiAgentCommand[] {
  return list.slice(0, 64).flatMap((command) => {
    const name = sanitize(command.name).replace(/^\//, '').slice(0, 64)
    const hint = command.input && 'hint' in command.input ? sanitize(command.input.hint).slice(0, 120) : ''
    return name ? [{ name, description: sanitize(command.description ?? '').slice(0, 120), ...(hint ? { hint } : {}) }] : []
  })
}
