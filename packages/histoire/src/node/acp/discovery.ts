import type { NewSessionResponse } from '@agentclientprotocol/sdk'
import type { UiAgentConfigOptions, UiAgentSettings } from '@histoire/shared'
import { methods } from '@agentclientprotocol/sdk'
import path from 'pathe'
import { createAgentRuntime, withAgentTimeout } from './agent-runtime.js'
import { applyAgentSessionDefaults, projectAgentConfig } from './session-config.js'
import { createAgentRedactor } from './user-data.js'

/** Temporary sessions never borrow a comment runtime or send prompts. */
export function createAgentDiscovery(options: {
  /** Root captured by this manager. */
  root: string
  /** Initialization/session timeout. */
  timeout: number
  /** Secret redaction shared with manager. */
  sanitize: (text: string) => string
}) {
  let generation = 0
  const cache = new Map<string, UiAgentConfigOptions>()
  const pending = new Map<string, Promise<UiAgentConfigOptions>>()
  const runtimes = new Set<ReturnType<typeof createAgentRuntime>>()
  let running = 0
  const waiters = new Set<() => void>()
  /** Queue capacity is separate from comment admission and wakes on retirement. */
  async function acquire(owner: number): Promise<void> {
    // Capacity changes when another asynchronous probe releases its slot.
    // eslint-disable-next-line no-unmodified-loop-condition
    while (running >= 2) await new Promise<void>(resolve => waiters.add(resolve))
    if (owner !== generation) throw new Error('Agent runtime closed')
    running++
  }
  /** Every release wakes queued probes to recheck capacity and generation. */
  function wake(): void {
    for (const resolve of waiters) resolve()
    waiters.clear()
  }
  return {
    /** Secret-bearing cache key stays in memory and never enters public snapshots. */
    discover(preset: UiAgentSettings['presets'][number], environment: Record<string, string>, prepare: () => Promise<{ preset: UiAgentSettings['presets'][number], environment: Record<string, string> }>, force = false): Promise<UiAgentConfigOptions> {
      const owner = generation
      const key = JSON.stringify([owner, preset, environment])
      if (pending.has(key)) return pending.get(key)
      if (!force && cache.has(key)) return Promise.resolve(structuredClone(cache.get(key)))
      const owned = () => owner === generation
      const operation = (async () => {
        await acquire(owner)
        let runtime: ReturnType<typeof createAgentRuntime> | undefined
        let sanitize = options.sanitize
        try {
          const prepared = await prepare()
          if (!owned()) throw new Error('Agent runtime closed')
          // Temporary processes are outside manager records. Capture their private
          // environment so registry defaults and replaced credentials stay redacted.
          const redact = createAgentRedactor([prepared.environment])
          sanitize = text => options.sanitize(redact(text))
          runtime = createAgentRuntime(prepared.preset, {
            root: options.root,
            environment: prepared.environment,
            sanitize,
            timeout: options.timeout,
            log: () => {},
            failed: () => {},
            update: () => {},
            permission: async () => ({ outcome: { outcome: 'cancelled' } }),
          })
          runtimes.add(runtime)
          await runtime.ready
          if (!owned()) throw new Error('Agent runtime closed')
          const session = await withAgentTimeout(runtime.connection.agent.request<NewSessionResponse>(methods.agent.session.new, { cwd: path.resolve(options.root, preset.cwd ?? '.'), mcpServers: [] }), options.timeout, 'ACP session handshake timed out')
          if (!owned()) throw new Error('Agent runtime closed')
          const configured = await applyAgentSessionDefaults(runtime, session.sessionId, preset, session.configOptions ?? [], options.timeout, owned)
          if (!owned()) throw new Error('Agent runtime closed')
          const result = projectAgentConfig(preset.id, configured.options, configured.warning)
          // Labels and values are arbitrary remote text; redact before browser projection.
          const safe = { ...result }
          for (const field of ['model', 'effort'] as const) {
            const selector = safe[field]
            if (selector) safe[field] = { configId: sanitize(selector.configId), currentValue: sanitize(selector.currentValue), options: selector.options.map(choice => ({ value: sanitize(choice.value), label: sanitize(choice.label), ...(choice.group ? { group: sanitize(choice.group) } : {}) })) }
          }
          cache.set(key, safe)
          return structuredClone(safe)
        }
        catch (error) {
          throw new Error(await runtime?.failureMessage() ?? sanitize(error instanceof Error ? error.message : String(error)))
        }
        finally {
          try {
            if (runtime) await runtime.stop()
          }
          finally {
            if (runtime) runtimes.delete(runtime)
            running--
            wake()
          }
        }
      })().finally(() => pending.delete(key))
      pending.set(key, operation)
      return operation
    },
    /** Retire captured async authority before stopping temporary process trees. */
    retire(): void {
      generation++
      cache.clear()
      wake()
      for (const runtime of runtimes) void runtime.stop().catch(() => {})
    },
    /** Drain probes as part of manager shutdown, including downloads and queued work. */
    async close(): Promise<void> {
      this.retire()
      await Promise.allSettled(pending.values())
    },
  }
}
