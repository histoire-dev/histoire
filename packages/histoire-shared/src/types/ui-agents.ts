import type { AgentPreset, HistoireUiConfig } from './config-ui.js'

/** Public agent process state without launch environment values. */
export interface UiAgentStatus {
  /** Configured preset identity. */
  id: string
  /** Display name. */
  name: string
  /** Lifecycle owned by this runtime. */
  state: 'disabled' | 'starting' | 'connected' | 'idle' | 'error' | 'not-installed'
  /** Redacted actionable failure. */
  error?: string
  /** Accepted defaults replaced a rejected saved configuration. */
  warning?: string
  /** Explicit per-agent opt-in. */
  enabled: boolean
  /** Redacted last stderr lines. */
  logs: string[]
  /** Names of user-level variables; their values are never returned. */
  envKeys: string[]
  /** Redacted slash commands last advertised by any session of this agent. */
  commands?: UiAgentCommand[]
}

/** One agent-advertised slash command. */
export interface UiAgentCommand {
  /** Command name without leading slash. */
  name: string
  /** Human-readable description. */
  description: string
  /** Optional input hint shown after the name. */
  hint?: string
}

/** Optional prompt context controlled by the local user's agent settings. */
export interface UiAgentContextOptions {
  /** Advertise the current Histoire MCP endpoint. */
  exposeMcp: boolean
  /** Include attached screenshot path. */
  attachScreenshot: boolean
  /** Include story source and props. */
  includeSource: boolean
  /** Ask the user to choose an agent for each comment. */
  askEachTime: boolean
}

/** Safe user-level preferences; environment overrides have a separate write-only API. */
export interface UiAgentSettings {
  /** Global explicit opt-in. */
  enabled: boolean
  /** Agent-specific explicit opt-ins. */
  enabledIds: string[]
  /** Editable commands with no env property. */
  presets: Omit<AgentPreset, 'env'>[]
  /** Agent permission policy. */
  permissions: NonNullable<NonNullable<HistoireUiConfig['agents']>['permissions']>
  /** Information shared with agents. */
  context: UiAgentContextOptions
}

/** Current safe process projection and user preferences. */
export interface UiAgentsSnapshot extends UiAgentSettings {
  /** Status for every configured preset. */
  agents: UiAgentStatus[]
  /** Deliberate public configuration error. */
  error?: string
}

/** One pending permission card, without tool raw input/output. */
export interface UiAgentPermission {
  /** Correlates approval with one broker-owned request. */
  requestId: string
  /** Agent asking for authorization. */
  agentId: string
  /** Tool category affecting policy; `plan` asks to leave plan mode. */
  kind: 'file-edit' | 'terminal' | 'plan' | 'other'
  /** Bounded redacted title and paths. */
  detail: string
  /** Thread whose active prompt asked, when known. */
  threadId?: string
  /** Redacted markdown plan the user approves, for `plan` requests. */
  plan?: string
  /** Explicit choices replacing the default allow/deny buttons, for `plan` requests. */
  choices?: UiAgentPermissionChoice[]
}

/** One broker-owned answer to a permission card. */
export interface UiAgentPermissionChoice {
  /** Broker-local identity sent back with the reply; never an agent option id. */
  id: string
  /** Short visible button label. */
  label: string
  /** Whether choosing it lets the tool run. */
  intent: 'approve' | 'reject'
}

/** One agent plan entry, as reported by ACP `plan` session updates. */
export interface UiAgentPlanEntry {
  /** Bounded redacted task description. */
  content: string
  /** Entry progress. */
  status: 'pending' | 'in_progress' | 'completed'
  /** Agent-reported importance. */
  priority?: 'high' | 'medium' | 'low'
}

/** User answer to a plan approval card, kept with the reply it belongs to. */
export interface UiAgentPlanDecision {
  /** Bounded redacted plan markdown the user answered; may be empty. */
  plan: string
  /** Chosen outcome. */
  outcome: 'approved' | 'kept-planning'
}

/** Streamed complete plan, replacing any previous plan of the same thread. */
export interface UiAgentPlan {
  /** Agent reporting the plan. */
  agentId: string
  /** Comment/thread identity. */
  threadId: string
  /** Current entries in agent order. */
  entries: UiAgentPlanEntry[]
}

/** Streamed comment reply chunk, scoped to its own agent thread. */
export interface UiAgentReply {
  /** Agent providing the reply. */
  agentId: string
  /** Comment/thread identity. */
  threadId: string
  /** Redacted text delta. */
  text: string
}

/** One agent tool call or thinking span, projected without arguments or output. */
export interface UiAgentStep {
  /** ACP tool call identity (or synthetic id for thinking spans). */
  id: string
  /** ACP tool category. */
  kind: 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'think' | 'fetch' | 'other'
  /** Bounded redacted human-readable title reported by the agent. */
  title: string
  /** ACP tool call lifecycle. */
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  /** First project-relative file location, when reported. */
  target?: string
  /** Lines added by this step's diffs. */
  added?: number
  /** Lines removed by this step's diffs. */
  removed?: number
}

/** Streamed agent step upsert, scoped to its own agent thread. */
export interface UiAgentActivity {
  /** Agent performing the step. */
  agentId: string
  /** Comment/thread identity. */
  threadId: string
  /** Full current step state, replacing any previous one with the same id. */
  step: UiAgentStep
}
