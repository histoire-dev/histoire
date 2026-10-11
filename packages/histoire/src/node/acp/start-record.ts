import type { SessionNotification } from '@agentclientprotocol/sdk'
import type { UiAgentSettings } from '@histoire/shared'
import type { createPermissionBroker } from './permissions.js'
import type { AgentRecord } from './record.js'
import { createAgentRuntime } from './agent-runtime.js'

/** Coalesced startup owns its record before any package download or SDK await. */
export async function startAgentRecord(record: AgentRecord, preset: UiAgentSettings['presets'][number], options: {
  /** Captured project root. */
  root: string
  /** Bounded initialize handshake. */
  timeout: number
  /** Resolves managed distribution and private environment. */
  prepare: () => Promise<{ preset: UiAgentSettings['presets'][number], environment: Record<string, string> }>
  /** Tests exact manager generation and record identity. */
  owned: () => boolean
  /** Redacts launch and protocol failures. */
  sanitize: (value: string) => string
  /** Safe state broadcaster. */
  changed: () => void
  /** Existing comment permission authority. */
  permissions: ReturnType<typeof createPermissionBroker>
  /** Existing notification observer. */
  update: (notification: SessionNotification) => void
}): Promise<void> {
  try {
    const prepared = await options.prepare()
    if (!options.owned()) throw new Error('Agent runtime closed')
    record.environment = prepared.environment
    record.runtime = createAgentRuntime(prepared.preset, {
      root: options.root,
      environment: record.environment,
      sanitize: options.sanitize,
      timeout: options.timeout,
      log(lines) {
        if (options.owned()) {
          record.status.logs = lines
          options.changed()
        }
      },
      failed(error, missing) {
        if (options.owned()) {
          record.status.state = missing ? 'not-installed' : 'error'
          record.status.error = error
          options.permissions.cancel(preset.id)
          options.changed()
        }
      },
      permission: request => options.owned() && record.active?.sessionId === request.sessionId ? options.permissions.request(preset.id, request) : Promise.resolve({ outcome: { outcome: 'cancelled' } }),
      update: (notification) => { if (options.owned()) options.update(notification) },
    })
    await record.runtime.ready
    if (!options.owned()) throw new Error('Agent runtime closed')
    record.status.state = 'connected'
    options.changed()
  }
  catch (error) {
    const message = await record.runtime?.failureMessage() ?? options.sanitize(error instanceof Error ? error.message : String(error))
    record.status.state = record.status.state === 'not-installed' ? 'not-installed' : 'error'
    record.status.error = message
    await record.runtime?.stop()
    if (options.owned()) options.changed()
    throw new Error(message)
  }
}
