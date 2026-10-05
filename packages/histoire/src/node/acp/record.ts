import type { UiAgentStatus } from '@histoire/shared'
import type { createAgentRuntime } from './agent-runtime.js'
import type { createAgentFileChanges } from './file-changes.js'
import type { AcpPromptRequest } from './types.js'
import type { createAgentOutputFilter } from './user-data.js'

/** One agent process and its independent comment-thread sessions. */
export interface AgentRecord {
  /** Private environment captured when this runtime starts, retained through teardown. */
  environment: Record<string, string>
  /** Safe current state. */
  status: UiAgentStatus
  /** Owned SDK/subprocess, acquired lazily. */
  runtime?: ReturnType<typeof createAgentRuntime>
  /** Coalesced startup. */
  start?: Promise<void>
  /** Coalesced teardown retains this record until its owned process tree exits. */
  stop?: Promise<void>
  /** Stable ACP sessions keyed by comment id. */
  sessions: Map<string, string>
  /** One live prompt per agent to avoid adapter-global interleaving. */
  active?: {
    /** User request and per-prompt observer. */
    request: AcpPromptRequest
    /** Active ACP session. */
    sessionId: string
    /** Redacted accumulated reply. */
    text: string
    /** Buffers secrets across protocol chunks. */
    output: ReturnType<typeof createAgentOutputFilter>
    /** Tracks completed tool diff summaries. */
    changes: ReturnType<typeof createAgentFileChanges>
  }
  /** Reserves adapter ownership before asynchronous session creation. */
  busy?: boolean
  /** Idle shutdown. */
  timer?: ReturnType<typeof setTimeout>
}
