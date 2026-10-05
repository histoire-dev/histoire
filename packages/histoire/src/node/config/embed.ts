import type { HistoireEmbedPolicy } from '@histoire/protocol'
import type { HistoireConfig } from '@histoire/shared'
import { validateEmbedOrigins, validateHostChannelNames } from '@histoire/protocol'

/** Normalized opt-in embedding configuration shared by Node/browser projections. */
export interface ResolvedEmbedConfig extends HistoireEmbedPolicy {
  /** Browser documents/data are emitted only when explicitly enabled. */
  enabled: boolean
  /** Mutable config pipeline owns its independently copied origin list. */
  allowedOrigins: string[]
  /** Configured names project into hostChannels capability, never origin authority. */
  channels: string[]
}

/** Validates entire configured policy before any embed document becomes available. */
export function resolveEmbedConfig(value?: HistoireConfig['embed']): ResolvedEmbedConfig {
  if (value != null && (typeof value !== 'object' || Array.isArray(value))) throw new Error('Expected embed configuration object')
  const config = value ?? {}
  for (const key of ['enabled', 'allowOpenInEditor', 'allowServerTests'] as const) {
    if (config[key] !== undefined && typeof config[key] !== 'boolean') throw new Error(`Expected embed.${key} boolean`)
  }
  return {
    enabled: config.enabled ?? false,
    allowedOrigins: validateEmbedOrigins(config.allowedOrigins ?? []),
    allowOpenInEditor: config.allowOpenInEditor ?? false,
    allowServerTests: config.allowServerTests ?? false,
    channels: validateHostChannelNames(config.channels ?? []),
  }
}
