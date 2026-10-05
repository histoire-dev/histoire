import type { HistoireUiConfig, UiAgentPermission, UiAgentReply, UiAgentSettings, UiAgentsSnapshot } from '@histoire/shared'

/** Information attached to one comment prompt; paths stay project relative. */
export interface AcpPromptContext {
  /** Selected story. */
  storyId?: string
  /** Selected variant. */
  variantId?: string
  /** Variant props captured with the comment. */
  props?: Record<string, unknown>
  /** Selected element. */
  selector?: string
  /** Screenshot stored beneath project screenshots. */
  screenshot?: string
  /** Optional source or source-file label. */
  source?: string
}

/** One explicit agent invocation scoped to a persistent comment thread. */
export interface AcpPromptRequest {
  /** Optional explicit agent; configured default applies otherwise. */
  agentId?: string
  /** Independent comment conversation identity. */
  threadId: string
  /** User-authored request. */
  text: string
  /** Scoped comment context. */
  context?: AcpPromptContext
  /** Optional consumer scoped to this prompt's reply chunks. */
  onUpdate?: (text: string) => void
}

/** File-change summary carried by ACP tool diff updates. */
export interface AcpFileChange {
  /** Project-relative changed file. */
  file: string
  /** Added line count. */
  added: number
  /** Removed line count. */
  removed: number
}

/** Full result after the agent finishes a prompt. */
export interface AcpPromptResult {
  /** Redacted agent reply. */
  text: string
  /** Agent-reported file diffs, when supplied. */
  changes?: AcpFileChange[]
}

/** Manager notifications, restricted to safe public DTOs. */
export type AcpUpdate =
  | { type: 'snapshot', value: UiAgentsSnapshot }
  | { type: 'permission', value: UiAgentPermission }
  | { type: 'permission-resolved', value: { requestId: string } }
  | { type: 'reply', value: UiAgentReply }

/** Construction dependencies owned by one active Histoire context. */
export interface AcpManagerOptions {
  /** Absolute project root. */
  root: string
  /** Project policy; env fields are ignored in favor of user-level storage. */
  config?: HistoireUiConfig['agents']
  /** Optional test/user data file override. */
  dataFile?: string
  /** Current real MCP endpoint, evaluated when creating a session. */
  mcpEndpoint?: () => string | undefined
  /** Stop idle agents after this many milliseconds. */
  idleTimeoutMs?: number
  /** Bound initialization and session creation. */
  handshakeTimeoutMs?: number
}

/** Explicit local settings fields overlay current project defaults. */
export type AcpSettingsOverrides = Partial<Omit<UiAgentSettings, 'permissions' | 'context'>> & {
  /** Independent policy fields, rather than an inherited whole policy snapshot. */
  permissions?: UiAgentSettings['permissions']
  /** Only deliberately edited context switches persist. */
  context?: Partial<UiAgentSettings['context']>
}

/** Versioned user-level file; environment values are never projected to UI. */
export interface AcpUserData {
  /** Current file version. */
  version: 2
  /** Independent project preferences. */
  projects: Record<string, AcpSettingsOverrides>
  /** User-level credentials keyed by agent identity. */
  env: Record<string, Record<string, string>>
}
