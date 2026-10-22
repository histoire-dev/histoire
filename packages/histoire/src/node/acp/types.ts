import type { HistoireUiConfig, UiAgentActivity, UiAgentElicitation, UiAgentElicitationResolved, UiAgentPermission, UiAgentPlan, UiAgentPlanDecision, UiAgentPlanEntry, UiAgentReply, UiAgentSettings, UiAgentsSnapshot, UiAgentStep } from '@histoire/shared'
import type { PromptFile } from './prompt-blocks.js'
import type { createAgentRegistry } from './registry.js'
import type { SessionConfigValues } from './session-config.js'

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
  /** Text is a slash command sent ahead of the context. */
  command?: boolean
  /** Attached and mentioned project files. */
  files?: PromptFile[]
  /** Session choices for this conversation (model, effort, mode). */
  options?: SessionConfigValues
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
  /** Settled tool calls and thinking spans, when any. */
  steps?: UiAgentStep[]
  /** Last plan the agent reported, when any. */
  plan?: UiAgentPlanEntry[]
  /** Plan approval answers given during the prompt, when any. */
  decisions?: UiAgentPlanDecision[]
}

/** Manager notifications, restricted to safe public DTOs. */
export type AcpUpdate =
  | { type: 'snapshot', value: UiAgentsSnapshot }
  | { type: 'permission', value: UiAgentPermission }
  | { type: 'permission-resolved', value: { requestId: string } }
  | { type: 'reply', value: UiAgentReply }
  | { type: 'activity', value: UiAgentActivity }
  | { type: 'plan', value: UiAgentPlan }
  | { type: 'elicitation', value: UiAgentElicitation }
  | { type: 'elicitation-resolved', value: UiAgentElicitationResolved }

/** Construction dependencies owned by one active Histoire context. */
export interface AcpManagerOptions {
  /** Absolute project root. */
  root: string
  /** Registry cache and remote boundary overrides, primarily for tests. */
  registry?: Parameters<typeof createAgentRegistry>[0]
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
  /** Longest wait for commands announced by a discovery probe; defaults to 1500ms. */
  commandsWaitMs?: number
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
