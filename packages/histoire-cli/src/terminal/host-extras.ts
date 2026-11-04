import type { RetainedHistories } from './retained.js'
import type { SessionHostExtras } from './session-types.js'
import type { InfoSection, TerminalViewHost } from './views/registry.js'
import { networkInterfaces } from 'node:os'
import { deriveNetworkUrls } from './info/network.js'
import { createRetainedHistories } from './retained.js'

/** Pieces of the view host that depend only on options, not on the session's screen state. */
export type HostExtras = Pick<TerminalViewHost, 'retained' | 'networkUrls' | 'addInfoSection' | 'infoSections'>

/**
 * Builds the retained-history registry, network URL derivation and info sections of the view host.
 * @param options Session options subset.
 * @param options.logs Session log history, always deletable through `x`.
 * @param options.retained Registry shared with the dev command, created here when absent.
 * @param options.host The `--host` value.
 * @param options.interfaces Network interface source (tests).
 * @param publicUrl Reads the bound public URL (changes on port fallback).
 */
export function createHostExtras(options: SessionHostExtras, publicUrl: () => string | undefined): HostExtras {
  const retained: RetainedHistories = options.retained ?? createRetainedHistories()
  retained.register({ id: 'logs', label: 'log entries', count: () => options.logs.entries().length, clear: () => options.logs.clear() })
  const sections = new Set<() => InfoSection | undefined>()
  return {
    retained,
    networkUrls: () => deriveNetworkUrls({ host: options.host, publicUrl: publicUrl(), interfaces: (options.interfaces ?? networkInterfaces)() }),
    addInfoSection(provider) {
      sections.add(provider)
      return () => void sections.delete(provider)
    },
    infoSections: () => [...sections].flatMap(provider => provider() ?? []),
  }
}
