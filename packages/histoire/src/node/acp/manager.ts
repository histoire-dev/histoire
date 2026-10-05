import type { SessionNotification } from '@agentclientprotocol/sdk'
import type { UiAgentSettings, UiAgentsSnapshot } from '@histoire/shared'
import type { AgentRecord } from './record.js'
import type { AcpManagerOptions, AcpPromptRequest, AcpPromptResult, AcpUpdate, AcpUserData } from './types.js'
import { Buffer } from 'node:buffer'
import { methods } from '@agentclientprotocol/sdk'
import { createAgentRuntime } from './agent-runtime.js'
import { createAgentControlLane } from './control-lane.js'
import { createPermissionBroker } from './permissions.js'
import { projectAgentStatuses } from './projection.js'
import { promptAgent } from './prompt.js'
import { defaultAgentSettings, mergeAgentSettings, retireAgentOverrides, updateAgentOverrides } from './settings.js'
import { agentUserDataFile, createAgentRedactor, readAgentUserData, updateAgentUserData } from './user-data.js'
import { validateAgentEnvironment, validateAgentSettings } from './validation.js'

/** Creates a project-owned ACP manager; construction never launches a process. */
export function createAcpManager(options: AcpManagerOptions) {
  const dataFile = options.dataFile ?? agentUserDataFile()
  let defaults = defaultAgentSettings(options.config)
  let settings = defaults
  let data: AcpUserData = { version: 2, projects: {}, env: {} }
  const records = new Map<string, AgentRecord>()
  const listeners = new Set<(event: AcpUpdate) => void>()
  let closed = false
  let closing: Promise<void> | undefined
  let generation = 0
  const controls = createAgentControlLane(() => closed)
  /** Safe callbacks cannot interrupt protocol or runtime teardown. */
  function emit(event: AcpUpdate): void {
    if (closed) return
    for (const listener of listeners) {
      try {
        listener(event)
      }
      catch { /* A disconnected UI cannot break agent ownership. */ }
    }
  }
  /** Keeps active runtime credentials available until their final public callback retires. */
  function publicEnvironments(): Record<string, string>[] {
    return [...Object.values(data.env), ...[...records.values()].map(record => record.environment)]
  }
  /** Combines saved and retiring runtime credentials for safe public projections. */
  function sanitize(text: string): string {
    return createAgentRedactor(publicEnvironments())(text)
  }
  /** Reads statuses without exposing private environment values or SDK objects. */
  function snapshot(): UiAgentsSnapshot {
    return {
      ...settings,
      enabledIds: [...settings.enabledIds],
      presets: settings.presets.map(preset => ({ ...preset, args: preset.args ? [...preset.args] : undefined })),
      permissions: { ...settings.permissions },
      context: { ...settings.context },
      agents: projectAgentStatuses(settings, new Map([...records].map(([id, record]) => [id, record.status])), data.env, sanitize),
    }
  }
  /** Publishes the safe state after every meaningful process/preference change. */
  function changed(): void {
    emit({ type: 'snapshot', value: snapshot() })
  }
  const permissions = createPermissionBroker({ root: options.root, policy: () => settings.permissions, sanitize, emit: value => emit({ type: 'permission', value }), resolved: requestId => emit({ type: 'permission-resolved', value: { requestId } }) })
  const ready = readAgentUserData(dataFile).then((value) => {
    if (closed) return
    data = value
    settings = mergeAgentSettings(defaults, data.projects[options.root])
    changed()
  })
  void ready.catch(() => {})
  /** Stops only one captured record, clearing its sessions and approvals. */
  async function stopRecord(id: string, record: AgentRecord): Promise<void> {
    if (record.stop) return record.stop
    clearTimeout(record.timer)
    if (records.get(id) === record) permissions.cancel(id)
    record.stop = Promise.resolve().then(() => record.runtime?.stop()).then(() => {
      if (records.get(id) === record) records.delete(id)
    })
    return record.stop
  }
  /** Captured records retain their slot until process-tree teardown finishes. */
  async function stopAll(): Promise<void> {
    await Promise.all([...records].map(([id, record]) => stopRecord(id, record)))
  }
  /** Retire existing prompt/start authority synchronously before queuing configuration. */
  function retire(): void {
    generation++
    permissions.cancel()
  }
  /** Starts one configured process on first explicit prompt; concurrent starts share it. */
  async function start(id: string, internal = false): Promise<AgentRecord> {
    if (closed) throw new Error('Agent manager is closed')
    if (!internal) controls.assertAdmission()
    const preset = settings.presets.find(item => item.id === id)
    if (!preset || !settings.enabled || !settings.enabledIds.includes(id)) throw new Error('Agent is disabled; enable it in AI agent settings')
    let record = records.get(id)
    if (record?.stop) {
      await record.stop
      return start(id, internal)
    }
    if (record?.start) {
      await record.start
      return record
    }
    record = {
      environment: { ...data.env[id] },
      status: { id, name: preset.name, state: 'starting', enabled: true, logs: [], envKeys: [] },
      sessions: new Map(),
    }
    records.set(id, record)
    const captured = record
    const owner = generation
    const owned = () => !closed && generation === owner && records.get(id) === captured
    captured.runtime = createAgentRuntime(preset, {
      root: options.root,
      environment: captured.environment,
      sanitize,
      timeout: options.handshakeTimeoutMs ?? 10_000,
      log(lines) {
        if (owned()) {
          captured.status.logs = lines
          changed()
        }
      },
      failed(error, missing) {
        if (owned()) {
          captured.status.state = missing ? 'not-installed' : 'error'
          captured.status.error = error
          permissions.cancel(id)
          changed()
        }
      },
      permission(request) { return owned() && captured.active?.sessionId === request.sessionId ? permissions.request(id, request) : Promise.resolve({ outcome: { outcome: 'cancelled' } }) },
      update(notification) { if (owned()) reply(id, captured, notification) },
    })
    changed()
    captured.start = captured.runtime.ready.then(() => {
      if (!owned()) throw new Error('Agent runtime closed')
      captured.status.state = 'connected'
      changed()
    }).catch(async (error) => {
      const message = await captured.runtime.failureMessage() ?? sanitize(error instanceof Error ? error.message : String(error))
      captured.status.state = captured.status.state === 'not-installed' ? 'not-installed' : 'error'
      captured.status.error = message
      await captured.runtime.stop()
      if (owned()) changed()
      throw new Error(message)
    })
    await captured.start
    return captured
  }
  /** Verified saves preserve edits made since submission; explicit reset targets current defaults. */
  function projectOverrides(paths: readonly string[], config?: AcpManagerOptions['config'], reset = false): Promise<void> {
    if (!paths.some(path => path === 'agents.presets' || path === 'agents.permissions')) return Promise.resolve()
    retire()
    return controls.run(async () => {
      await ready
      if (closed) throw new Error('Agent manager is closed')
      const nextDefaults = reset ? defaults : defaultAgentSettings(config)
      const overrides = retireAgentOverrides(data.projects[options.root] ?? {}, paths, settings, nextDefaults, reset)
      await stopAll()
      data = await updateAgentUserData(dataFile, options.root, overrides)
      if (closed) throw new Error('Agent manager is closed')
      defaults = nextDefaults
      settings = mergeAgentSettings(defaults, overrides)
      changed()
    })
  }
  /** Accepts only text reply chunks belonging to this exact active prompt/session. */
  function reply(agentId: string, record: AgentRecord, notification: SessionNotification): void {
    const active = record.active
    if (!active || notification.sessionId !== active.sessionId) return
    const update = notification.update
    active.changes.update(notification)
    if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
      const text = active.output.push(update.content.text)
      if (!text) return
      active.text = `${active.text}${text}`.slice(-256_000)
      replyChunk(agentId, active.request, text)
    }
  }
  /** Safe consumers cannot break ACP notification dispatch. */
  function replyChunk(agentId: string, request: AcpPromptRequest, text: string): void {
    // Worst-case JSON escaping takes six bytes per character; small chunks stay
    // within the UI channel's 64 KB limit without changing secret filtering.
    for (let index = 0; index < text.length; index += 8000) {
      const chunk = text.slice(index, index + 8000)
      try {
        request.onUpdate?.(chunk)
      }
      catch { /* UI/comment observers do not own the agent transport. */ }
      emit({ type: 'reply', value: { agentId, threadId: request.threadId, text: chunk } })
    }
  }
  return {
    ready,
    snapshot,
    /** Subscribes to this runtime's safe process/reply/permission updates. */
    onUpdate(listener: (event: AcpUpdate) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** Persist changed fields only; admission retires before the first asynchronous step. */
    configure(value: UiAgentSettings): Promise<void> {
      const next = validateAgentSettings(value)
      retire()
      return controls.run(async () => {
        await ready
        if (closed) throw new Error('Agent manager is closed')
        const overrides = updateAgentOverrides(defaults, settings, next, data.projects[options.root])
        await stopAll()
        data = await updateAgentUserData(dataFile, options.root, overrides)
        if (closed) throw new Error('Agent manager is closed')
        settings = mergeAgentSettings(defaults, overrides)
        changed()
      })
    },
    /** Retire only verified saved paths whose current value still matches the submitted value. */
    retireProjectOverrides: (paths: readonly string[], config?: AcpManagerOptions['config']) => projectOverrides(paths, config),
    /** Reset named local paths to authoritative project defaults without changing project files. */
    resetProjectOverrides: (paths: readonly string[]) => projectOverrides(paths, undefined, true),
    /** Private credential updates share the mutation lane without retiring other agents' prompts. */
    setEnvironment(agentId: string, env: Record<string, string>): Promise<void> {
      const checked = validateAgentEnvironment({ agentId, env })
      return controls.run(async () => {
        await ready
        if (closed) throw new Error('Agent manager is closed')
        if (!settings.presets.some(preset => preset.id === agentId)) throw new Error('Unknown agent')
        data = await updateAgentUserData(dataFile, options.root, undefined, { id: agentId, value: checked.env })
        const record = records.get(agentId)
        if (record) await stopRecord(agentId, record)
        if (!closed) changed()
      })
    },
    /** Returns a persistent per-thread ACP reply; source edits stay agent-owned. */
    async prompt(request: AcpPromptRequest): Promise<AcpPromptResult> {
      await ready
      controls.assertAdmission()
      if (!request.threadId || !request.text || Buffer.byteLength(request.text) > 48 * 1024) throw new Error('Invalid agent prompt')
      const id = request.agentId ?? settings.presets.find(preset => preset.default)?.id ?? settings.presets[0]?.id
      if (!id) throw new Error('No agent configured')
      const captured = generation
      const record = await start(id)
      controls.assertAdmission()
      if (captured !== generation) throw new Error('Agent runtime closed')
      return promptAgent(record, request, {
        root: options.root,
        settings,
        environment: record.environment,
        mcpEndpoint: options.mcpEndpoint?.(),
        handshakeTimeout: options.handshakeTimeoutMs ?? 10_000,
        idleTimeout: options.idleTimeoutMs ?? 5 * 60_000,
        isOwned: () => !closed && generation === captured && records.get(id) === record,
        changed,
        sanitize,
        settle: (sessionId) => { if (records.get(id) === record) permissions.settle(id, sessionId) },
        stop: () => stopRecord(id, record),
        reply: text => replyChunk(id, request, text),
      })
    },
    /** Cancels only the requested comment conversation and its permission cards. */
    async cancel(threadId: string): Promise<void> {
      for (const [id, record] of records) {
        const sessionId = record.sessions.get(threadId)
        if (sessionId && record.active?.request.threadId === threadId) {
          permissions.cancel(id, sessionId)
          await record.runtime.connection.agent.notify(methods.agent.session.cancel, { sessionId })
        }
      }
    },
    replyPermission: permissions.reply,
    /** Restarts share configuration admission; a queued retirement cannot resurrect its predecessor. */
    restart(agentId: string): Promise<void> {
      const captured = generation
      return controls.run(async () => {
        await ready
        if (closed || captured !== generation) throw new Error('Agent runtime closed')
        const record = records.get(agentId)
        if (record) {
          await stopRecord(agentId, record)
          if (closed || captured !== generation) throw new Error('Agent runtime closed')
          await start(agentId, true)
        }
        if (!closed) changed()
      })
    },
    /** Retires all processes before a dev context or configuration generation ends. */
    close(): Promise<void> {
      if (closing) return closing
      closed = true
      generation++
      permissions.close()
      closing = Promise.all([stopAll(), controls.settled()]).then(() => {}).finally(() => listeners.clear())
      return closing
    },
  }
}

/** Public manager contract used by comment threads. */
export type AcpManager = ReturnType<typeof createAcpManager>
