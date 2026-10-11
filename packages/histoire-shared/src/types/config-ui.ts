/** Locally launched ACP agent; environment values never enter browser config. */
export interface AgentPreset {
  /** Stable project-local identifier. */
  id: string
  /** Display name. */
  name: string
  /** Executable command. */
  command: string
  /** Canonical ACP registry identity for managed launch. */
  registryId?: string
  /** Saved model override; omission uses agent default. */
  model?: string
  /** Saved reasoning override; omission uses agent default. */
  effort?: string
  /** Command arguments. */
  args?: string[]
  /** User-level environment overrides, excluded from serialized config. */
  env?: Record<string, string>
  /** Working directory for this agent. */
  cwd?: string
  /** Select this preset when no explicit agent is chosen. */
  default?: boolean
}

/** Optional workbench capabilities. */
export interface HistoireUiConfig {
  /** Canvas defaults; persisted user settings take precedence. */
  ui?: {
    /** Initial arrangement when story layout and URL omit it. */
    defaultArrange?: 'single' | 'grid' | 'list'
    /** Maximum simultaneously live preview frames. Defaults to 6. */
    frameBudget?: number
    /** Defaults for props matrix sampling. */
    matrix?: {
      /** Ordered samples for open numeric props; 2–64 distinct finite values. */
      numericValues?: readonly number[]
    }
  }
  /** ACP remains disabled until explicitly enabled. */
  agents?: {
    /** Enable local ACP clients. Defaults to false. */
    enabled?: boolean
    /** Available local launch presets. */
    presets?: AgentPreset[]
    /** Permission policy for agent operations. */
    permissions?: {
      /** Source-edit permission policy. */
      fileEdits?: 'ask' | 'allow-src' | 'never'
      /** Terminal permission policy. */
      terminal?: 'ask' | 'allow' | 'never'
    }
  }
  /** Development comments are stored locally in the project. */
  comments?: {
    /** Enable comments in dev. Defaults to true. */
    enabled?: boolean
    /** Project-relative comment file. Defaults to '.histoire/comments.json'. */
    file?: string
  }
}
