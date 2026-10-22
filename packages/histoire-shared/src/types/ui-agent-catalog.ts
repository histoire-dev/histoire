import type { UiAgentCommand } from './ui-agents.js'

/** Secret-free catalog entry; launch distributions remain server-owned. */
export interface UiAgentRegistryEntry {
  /** Canonical registry identity. */
  id: string
  /** Display name. */
  name: string
  /** Published adapter version. */
  version?: string
  /** Optional HTTPS logo URL from published registry, rendered as an isolated image. */
  icon?: string
  /** Current platform has a supported distribution. */
  available: boolean
  /** Informational command shown in advanced settings. */
  command: string
  /** Exact informational argument boundaries. */
  args: string[]
}

/** Catalog freshness never changes local opt-ins or custom commands. */
export interface UiAgentRegistry {
  /** Every valid published entry, independent of configured preset limit. */
  entries: UiAgentRegistryEntry[]
  /** Network/cache availability. */
  status: { state: 'fresh' | 'stale' | 'unavailable', error?: string }
}

/** Advertised selector choice, retaining agent order and optional grouping. */
export interface UiAgentConfigChoice {
  /** Opaque ACP value. */
  value: string
  /** Human-readable choice. */
  label: string
  /** Optional group label. */
  group?: string
}

/** Agent-owned model or reasoning selector. */
export interface UiAgentConfigSelector {
  /** ACP configuration option identity. */
  configId: string
  /** Accepted session value. */
  currentValue: string
  /** Ordered advertised choices. */
  options: UiAgentConfigChoice[]
}

/** Safe result of bounded model/effort discovery. */
export interface UiAgentConfigOptions {
  /** Configured preset identity. */
  agentId: string
  /** Absent when adapter exposes no model selector. */
  model?: UiAgentConfigSelector
  /** Absent when adapter exposes no thought-level selector. */
  effort?: UiAgentConfigSelector
  /** Absent when adapter exposes no session mode selector. */
  mode?: UiAgentConfigSelector
  /** Slash commands the probe session advertised. */
  commands?: UiAgentCommand[]
  /** Saved override was refused or unsupported. */
  warning?: string
}
