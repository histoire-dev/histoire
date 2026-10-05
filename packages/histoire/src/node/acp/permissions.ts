import type { RequestPermissionRequest, RequestPermissionResponse } from '@agentclientprotocol/sdk'
import type { UiAgentPermission, UiAgentSettings } from '@histoire/shared'
import { randomUUID } from 'node:crypto'
import path from 'pathe'
import { guardProjectPath } from '../config/codemod/security.js'

/** Denied/cancelled requests never accidentally select an allow option. */
const denied: RequestPermissionResponse = { outcome: { outcome: 'cancelled' } }

/** Mediates agent-owned file/terminal tools without hosting either operation. */
export function createPermissionBroker(options: {
  /** Project boundary used for allow-src. */
  root: string
  /** Current local permission policy. */
  policy: () => UiAgentSettings['permissions']
  /** Emit one sanitized permission prompt. */
  emit: (value: UiAgentPermission) => void
  /** Notify browsers when a card is no longer pending. */
  resolved?: (requestId: string) => void
  /** Redact credentials before showing titles/paths. */
  sanitize: (value: string) => string
}) {
  const pending = new Map<string, { agentId: string, request: RequestPermissionRequest, kind: UiAgentPermission['kind'], finish: (value: RequestPermissionResponse) => void }>()
  const remembered = new Set<string>()
  let closed = false
  let revision = 0
  const agents = new Map<string, number>()
  const sessions = new Map<string, number>()
  /** Agent/session revisions isolate asynchronous confinement checks. */
  function owner(agentId: string, sessionId: string): string {
    return JSON.stringify([revision, agents.get(agentId) ?? 0, sessions.get(JSON.stringify([agentId, sessionId])) ?? 0])
  }
  /** Maps known tool categories to distinct policy classes. */
  function kindOf(request: RequestPermissionRequest): UiAgentPermission['kind'] {
    if (['edit', 'delete', 'move'].includes(request.toolCall.kind)) return 'file-edit'
    return request.toolCall.kind === 'execute' ? 'terminal' : 'other'
  }
  /** Uses only agent-advertised allowed choices; unknown choices remain denied. */
  function allowed(request: RequestPermissionRequest): RequestPermissionResponse {
    // Remember locally so an adapter's allow_always option cannot outlive this session.
    const option = request.options.find(item => item.kind === 'allow_once')
    return option ? { outcome: { outcome: 'selected', optionId: option.optionId } } : denied
  }
  /** Checks real source paths, including missing files under existing ancestors. */
  async function sourceOnly(request: RequestPermissionRequest): Promise<boolean> {
    const locations = request.toolCall.locations ?? []
    if (!locations.length) return false
    try {
      const source = await guardProjectPath(path.join(options.root, 'src'), options.root)
      for (const location of locations) {
        const target = await guardProjectPath(path.resolve(options.root, location.path), options.root)
        const relative = path.relative(source, target)
        if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) return false
      }
      return true
    }
    catch { return false }
  }
  /** Denies pending cards, including requests from a crashing/cancelled agent. */
  function cancel(agentId?: string, sessionId?: string, forget = true): void {
    if (!agentId) {
      revision++
      agents.clear()
      sessions.clear()
    }
    else if (!sessionId) {
      agents.set(agentId, (agents.get(agentId) ?? 0) + 1)
      for (const key of sessions.keys()) {
        if (JSON.parse(key)[0] === agentId) sessions.delete(key)
      }
    }
    else {
      const key = JSON.stringify([agentId, sessionId])
      sessions.set(key, (sessions.get(key) ?? 0) + 1)
    }
    for (const [id, item] of pending) {
      if ((!agentId || item.agentId === agentId) && (!sessionId || item.request.sessionId === sessionId)) {
        item.finish(denied)
        pending.delete(id)
        options.resolved?.(id)
      }
    }
    if (forget) {
      for (const key of remembered) {
        const [rememberedAgent, rememberedSession] = JSON.parse(key)
        if ((!agentId || rememberedAgent === agentId) && (!sessionId || rememberedSession === sessionId)) remembered.delete(key)
      }
    }
  }
  return {
    /** Requests permission only when current policy does not decide it safely. */
    async request(agentId: string, request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
      if (closed) return denied
      const captured = owner(agentId, request.sessionId)
      const kind = kindOf(request)
      const policy = options.policy()
      const choice = kind === 'file-edit' ? policy.fileEdits : kind === 'terminal' ? policy.terminal : 'ask'
      if (choice === 'never') return denied
      if (remembered.has(JSON.stringify([agentId, request.sessionId, kind]))) return allowed(request)
      const automatic = choice === 'allow' || (choice === 'allow-src' && await sourceOnly(request))
      if (closed || owner(agentId, request.sessionId) !== captured) return denied
      if (automatic) return allowed(request)
      if (pending.size >= 32) return denied
      return new Promise((finish) => {
        const requestId = randomUUID()
        pending.set(requestId, { agentId, request, kind, finish })
        const detail = options.sanitize([request.toolCall.title ?? 'Agent tool request', ...(request.toolCall.locations ?? []).map(item => item.path)].join('\n')).slice(0, 4000)
        options.emit({ requestId, agentId, kind, detail })
      })
    },
    /** Resolves exactly one live card; stale/duplicate browser replies do nothing. */
    reply(requestId: string, allow: boolean, remember: boolean): void {
      const item = pending.get(requestId)
      if (!item) return
      pending.delete(requestId)
      const outcome = allow ? allowed(item.request) : denied
      if (allow && remember && outcome.outcome.outcome === 'selected') remembered.add(JSON.stringify([item.agentId, item.request.sessionId, item.kind]))
      item.finish(outcome)
      options.resolved?.(requestId)
    },
    cancel,
    /** Ends a prompt without discarding approvals for its persistent ACP session. */
    settle(agentId: string, sessionId: string): void { cancel(agentId, sessionId, false) },
    /** Denies every unresolved request before the runtime retires. */
    close(): void {
      closed = true
      cancel()
      remembered.clear()
    },
  }
}
