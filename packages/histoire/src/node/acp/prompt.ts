import type { UiAgentSettings } from '@histoire/shared'
import type { AgentRecord } from './record.js'
import type { AcpPromptRequest, AcpPromptResult } from './types.js'
import { methods } from '@agentclientprotocol/sdk'
import path from 'pathe'
import { withAgentTimeout } from './agent-runtime.js'
import { createAgentFileChanges } from './file-changes.js'
import { buildPromptContext, safeMcpEndpoint } from './prompt-context.js'
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

/** Creates/reuses one thread session and retains process ownership through its reply. */
export async function promptAgent(record: AgentRecord, request: AcpPromptRequest, options: PromptOptions): Promise<AcpPromptResult> {
  clearTimeout(record.timer)
  if (record.busy) throw new Error('Agent is busy; wait for its current reply')
  record.busy = true
  const runtime = record.runtime
  let sessionId = record.sessions.get(request.threadId)
  try {
    if (!sessionId) {
      const preset = options.settings.presets.find(item => item.id === record.status.id)
      const endpoint = options.settings.context.exposeMcp ? safeMcpEndpoint(options.mcpEndpoint) : undefined
      const initialized = await runtime.ready
      const mcpServers = endpoint && initialized.agentCapabilities?.mcpCapabilities?.http ? [{ type: 'http' as const, name: 'histoire', url: endpoint, headers: [] }] : []
      try {
        const session = await withAgentTimeout<{ sessionId: string }>(runtime.connection.agent.request(methods.agent.session.new, { cwd: path.resolve(options.root, preset.cwd ?? '.'), mcpServers }), options.handshakeTimeout, 'ACP session handshake timed out')
        if (!options.isOwned()) throw new Error('Agent runtime closed')
        sessionId = session.sessionId
        record.sessions.set(request.threadId, sessionId)
      }
      catch (error) {
        record.status.state = 'error'
        record.status.error = await runtime.failureMessage() ?? options.sanitize(error instanceof Error ? error.message : String(error))
        await runtime.stop()
        if (options.isOwned()) options.changed()
        throw new Error(record.status.error)
      }
    }
    if (!options.isOwned()) throw new Error('Agent runtime closed')
    record.active = { request, sessionId, text: '', output: createAgentOutputFilter(options.environment), changes: createAgentFileChanges(options.root, options.sanitize) }
    record.status.state = 'connected'
    options.changed()
    try {
      const context = buildPromptContext(request.context, options.settings.context, options.mcpEndpoint)
      const result = await runtime.connection.agent.request(methods.agent.session.prompt, { sessionId, prompt: [{ type: 'text', text: `${context}\n\n${request.text}` }] })
      if (!options.isOwned()) throw new Error('Agent runtime closed')
      if (result.stopReason === 'cancelled') throw new Error('Agent prompt cancelled')
      const tail = record.active.output.finish()
      record.active.text += tail
      if (tail) options.reply(tail)
      const changes = record.active.changes.snapshot()
      return { text: record.active.text, ...changes.length ? { changes } : {} }
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
