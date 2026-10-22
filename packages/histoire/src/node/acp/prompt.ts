import type { NewSessionResponse } from '@agentclientprotocol/sdk'
import type { UiAgentSettings } from '@histoire/shared'
import type { PromptFile } from './prompt-blocks.js'
import type { AgentRecord } from './record.js'
import type { AcpPromptRequest, AcpPromptResult } from './types.js'
import { methods } from '@agentclientprotocol/sdk'
import path from 'pathe'
import { createAgentActivity } from './activity.js'
import { withAgentTimeout } from './agent-runtime.js'
import { createAgentFileChanges } from './file-changes.js'
import { buildPromptBlocks } from './prompt-blocks.js'
import { buildPromptContext, safeMcpEndpoint } from './prompt-context.js'
import { applyAgentSessionDefaults, applySessionConfig } from './session-config.js'
import { createAgentOutputFilter } from './user-data.js'

/** Dependencies captured by the project manager for one explicit prompt. */
export interface PromptOptions {
  /** Current root. */
  root: string
  /** Current public preferences. */
  settings: UiAgentSettings
  /** Current private environment, never returned. */
  environment: Record<string, string>
  /** Current MCP endpoint. */
  mcpEndpoint?: string
  /** Bounds session acquisition. */
  handshakeTimeout: number
  /** Retires idle owned processes. */
  idleTimeout: number
  /** Tests generation and record ownership after every protocol await. */
  isOwned: () => boolean
  /** Broadcast safe process updates. */
  changed: () => void
  /** Emits one safe reply chunk. */
  reply: (text: string) => void
  /** Settles pending permission cards while preserving session approvals. */
  settle: (sessionId: string) => void
  /** Retires the captured record on idle/session failure. */
  stop: () => Promise<void>
  /** Safe error/path projection. */
  sanitize: (text: string) => string
}

/**
 * Attached files plus the screenshot when the user shares screenshots with agents.
 * A reused session already received files attached to earlier messages, so those are dropped.
 * @param request Prompt request.
 * @param settings Current public preferences.
 * @param reused The thread's agent session existed before this prompt.
 */
function promptFiles(request: AcpPromptRequest, settings: UiAgentSettings, reused: boolean): PromptFile[] {
  const screenshot = settings.context.attachScreenshot ? request.context?.screenshot : undefined
  const files = (request.files ?? []).filter(file => !reused || !file.earlier)
  return [...screenshot ? [{ path: screenshot, name: 'Canvas screenshot' }] : [], ...files]
}

/**
 * Creates/reuses one thread session and retains process ownership through its reply.
 * @param record Captured agent record.
 * @param request Prompt request.
 * @param options Manager dependencies.
 */
export async function promptAgent(record: AgentRecord, request: AcpPromptRequest, options: PromptOptions): Promise<AcpPromptResult> {
  clearTimeout(record.timer)
  if (record.busy) throw new Error('Agent is busy; wait for its current reply')
  record.busy = true
  const runtime = record.runtime
  let sessionId = record.sessions.get(request.threadId)?.sessionId
  const reused = Boolean(sessionId)
  try {
    if (!sessionId) {
      const preset = options.settings.presets.find(item => item.id === record.status.id)
      const endpoint = options.settings.context.exposeMcp ? safeMcpEndpoint(options.mcpEndpoint) : undefined
      const initialized = await runtime.ready
      const mcpServers = endpoint && initialized.agentCapabilities?.mcpCapabilities?.http ? [{ type: 'http' as const, name: 'histoire', url: endpoint, headers: [] }] : []
      try {
        const session = await withAgentTimeout(runtime.connection.agent.request<NewSessionResponse>(methods.agent.session.new, { cwd: path.resolve(options.root, preset.cwd ?? '.'), mcpServers }), options.handshakeTimeout, 'ACP session handshake timed out')
        if (!options.isOwned()) throw new Error('Agent runtime closed')
        sessionId = session.sessionId
        const configured = await applyAgentSessionDefaults(runtime, sessionId, preset, session.configOptions ?? [], options.handshakeTimeout, options.isOwned, request.options)
        if (!options.isOwned()) throw new Error('Agent runtime closed')
        record.status.warning = configured.warning
        record.sessions.set(request.threadId, { ...session, configOptions: configured.options })
      }
      catch (error) {
        record.status.state = 'error'
        record.status.error = await runtime.failureMessage() ?? options.sanitize(error instanceof Error ? error.message : String(error))
        await runtime.stop()
        if (options.isOwned()) options.changed()
        throw new Error(record.status.error)
      }
    }
    else if (request.options) {
      // Choices changed mid-conversation apply to the existing session before this turn.
      const session = record.sessions.get(request.threadId)!
      const configured = await applySessionConfig(runtime, sessionId, request.options, session.configOptions ?? [], options.handshakeTimeout, options.isOwned)
      record.sessions.set(request.threadId, { ...session, configOptions: configured.options })
      // Rejected choices stay visible, as for a new session.
      record.status.warning = configured.warning
      options.changed()
    }
    if (!options.isOwned()) throw new Error('Agent runtime closed')
    record.active = { request, sessionId, text: '', output: createAgentOutputFilter(options.environment), changes: createAgentFileChanges(options.root, options.sanitize), activity: createAgentActivity(options.root, options.sanitize) }
    record.status.state = 'connected'
    options.changed()
    try {
      const context = buildPromptContext(request.context, options.settings.context, options.mcpEndpoint)
      const image = Boolean((await runtime.ready).agentCapabilities?.promptCapabilities?.image)
      const prompt = await buildPromptBlocks({ root: options.root, text: request.text, context, command: request.command, files: promptFiles(request, options.settings, reused), image })
      const result = await runtime.connection.agent.request(methods.agent.session.prompt, { sessionId, prompt })
      if (!options.isOwned()) throw new Error('Agent runtime closed')
      if (result.stopReason === 'cancelled') throw new Error('Agent prompt cancelled')
      const tail = record.active.output.finish()
      record.active.text += tail
      if (tail) options.reply(tail)
      const changes = record.active.changes.snapshot()
      const steps = record.active.activity.finish()
      return { text: record.active.text, ...changes.length ? { changes } : {}, ...steps.length ? { steps } : {} }
    }
    catch (error) { throw new Error(await runtime.failureMessage() ?? options.sanitize(error instanceof Error ? error.message : String(error))) }
    finally {
      options.settle(sessionId)
      record.active = undefined
      if (options.isOwned() && !['error', 'not-installed'].includes(record.status.state)) {
        record.status.state = 'idle'
        record.timer = setTimeout(() => {
          void options.stop().then(options.changed)
        }, options.idleTimeout)
        record.timer.unref()
        options.changed()
      }
    }
  }
  finally { record.busy = false }
}
