import type { UiAgentSettings } from '@histoire/shared'
import type { AcpManagerOptions } from './types.js'
import { createAgentBinaryCache } from './binary-cache.js'
import { createAgentDiscovery } from './discovery.js'
import { createAgentRegistryIcons } from './registry-icons.js'
import { createAgentRegistry } from './registry.js'

/** Manager-scoped registry preparation and discovery retain independent process ownership. */
export function createAgentServices(options: AcpManagerOptions, sanitize: (text: string) => string) {
  const registry = createAgentRegistry(options.registry)
  const binaries = createAgentBinaryCache(registry.cacheDir)
  const icons = createAgentRegistryIcons({ cacheDir: registry.cacheDir, fetch: options.registry?.fetch, iconUrl: registry.iconUrl })
  const discovery = createAgentDiscovery({ root: options.root, timeout: options.handshakeTimeoutMs ?? 10_000, sanitize })
  let controller = new AbortController()
  /** Resolve managed distribution without exposing archive URLs to browser. */
  async function prepare(preset: UiAgentSettings['presets'][number], environment: Record<string, string>) {
    const signal = controller.signal
    if (!preset.registryId) return { preset, environment }
    const distribution = await abortablePreparation(registry.distribution(preset.registryId), signal)
    signal.throwIfAborted()
    const command = distribution.kind === 'binary' ? await binaries.prepare(preset.registryId, distribution, signal) : distribution.command
    signal.throwIfAborted()
    return { preset: { ...preset, command, args: distribution.args }, environment: { ...distribution.env, ...environment } }
  }
  return {
    /** A forced catalog refresh invalidates capabilities tied to previous adapter versions. */
    async registry(force = false) {
      const result = await registry.load(force)
      if (force) discovery.retire()
      return result
    },
    prepare,
    /** Same-origin SVG logo of a registry agent. */
    icon: icons.get,
    /** Coalesced probes use exact configured command/environment/model identity. */
    discover: (preset: UiAgentSettings['presets'][number], environment: Record<string, string>, force = false) => discovery.discover(preset, environment, () => prepare(preset, environment), force),
    /** Abort preparing launches synchronously before preferences enter control lane. */
    retire(): void {
      controller.abort(new Error('Agent runtime closed'))
      controller = new AbortController()
      discovery.retire()
    },
    /** No temporary agent survives context shutdown. */
    async close(): Promise<void> {
      controller.abort(new Error('Agent runtime closed'))
      await discovery.close()
    },
  }
}

/** Stop awaiting shared catalog fetch immediately when this preparation loses authority. */
async function abortablePreparation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let abort: () => void
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
    })])
  }
  finally { signal.removeEventListener('abort', abort) }
}
