import type { UiAgentPermission, UiAgentsSnapshot } from '@histoire/shared'
import type { IncomingMessage } from 'node:http'
import type { AgentsTransport } from '../../../../histoire-app/src/app/stores/agents.js'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createAgentsStore } from '../../../../histoire-app/src/app/stores/agents.js'
import { projectAgentStatuses } from '../acp/projection.js'
import { validateAgentSettings } from '../acp/validation.js'
import { AGENT_ENVIRONMENT_PATH, isAgentEnvironmentOrigin, registerAgentEnvironment } from '../server/ui-channel/agents-env.js'
import { installUiHttpRouter } from '../server/ui-channel/http.js'

/** Exact safe server state avoids browser/platform globals in store checks. */
function snapshot(): UiAgentsSnapshot {
  return { enabled: true, enabledIds: ['fake'], presets: [{ id: 'fake', name: 'Fake', command: 'fake', default: true }], agents: [], permissions: { fileEdits: 'ask', terminal: 'ask' }, context: { exposeMcp: true, attachScreenshot: true, includeSource: true, askEachTime: false } }
}

/** Injectable transport lets tests deliver stale callbacks and inspect safe commands. */
function transport() {
  const callbacks: Record<string, (value?: any) => void> = {}
  const send = vi.fn(() => true)
  const environment = vi.fn(async () => {})
  const off = vi.fn()
  /** Captures a subscription without needing a live Vite connection. */
  function subscribe(key: string) {
    return (callback: (value?: any) => void) => {
      callbacks[key] = callback
      return off
    }
  }
  const value: AgentsTransport = { send, environment, snapshot: subscribe('snapshot'), permission: subscribe('permission'), resolved: subscribe('resolved'), disconnect: subscribe('disconnect') }
  return { callbacks, send, environment, off, value }
}

describe('safe agent UI ownership', () => {
  it('waits for authoritative settings, keeps secrets out of HMR and rejects late state after teardown', async () => {
    const peer = transport()
    const store = createAgentsStore(peer.value)
    peer.callbacks.snapshot(snapshot())
    store.enableAgent('fake', false)
    expect(store.pending.value).toBe(true)
    expect(store.state.value.enabledIds).toEqual(['fake'])
    const { agents: _agents, ...settings } = snapshot()
    expect(peer.send).toHaveBeenLastCalledWith('histoire:ui:agents-configure', { ...settings, enabledIds: [] })
    await store.environment('fake', { API_KEY: 'private-value' })
    expect(peer.environment).toHaveBeenCalledWith('fake', { API_KEY: 'private-value' })
    expect(JSON.stringify([peer.send.mock.calls, store.state.value])).not.toContain('private-value')
    peer.callbacks.snapshot({ ...snapshot(), enabledIds: [] })
    expect(store.pending.value).toBe(false)
    store.close()
    peer.callbacks.snapshot(snapshot())
    expect(store.state.value.enabledIds).toEqual([])
    expect(peer.off).toHaveBeenCalledTimes(4)
  })

  it('resets only named overrides without sending browser project defaults', () => {
    const peer = transport()
    const store = createAgentsStore(peer.value)
    peer.callbacks.snapshot(snapshot())
    store.resetProject(['agents.presets'])
    expect(peer.send).toHaveBeenLastCalledWith('histoire:ui:agents-reset-project', { paths: ['agents.presets'] })
    expect(store.pending.value).toBe(true)
    expect(store.state.value.presets).toEqual(snapshot().presets)
    store.resetProject(['agents.permissions'])
    expect(peer.send).toHaveBeenCalledTimes(1)
    peer.callbacks.snapshot(snapshot())
    expect(store.pending.value).toBe(false)
    store.close()
    store.resetProject(['agents.permissions'])
    expect(peer.send).toHaveBeenCalledTimes(1)
  })

  it('deduplicates live permissions, handles cancellation and refuses stale/disconnected replies', () => {
    const peer = transport()
    const store = createAgentsStore(peer.value)
    const request: UiAgentPermission = { requestId: 'request-one', agentId: 'fake', kind: 'file-edit', detail: 'Edit source' }
    peer.callbacks.permission(request)
    peer.callbacks.permission(request)
    expect(store.permissions.value).toHaveLength(1)
    peer.callbacks.resolved({ requestId: request.requestId })
    store.reply(request.requestId, true)
    expect(peer.send).not.toHaveBeenCalled()
    peer.callbacks.permission(request)
    peer.send.mockReturnValue(false)
    store.reply(request.requestId, true)
    expect(store.permissions.value).toHaveLength(1)
    peer.callbacks.disconnect()
    expect(store.permissions.value).toEqual([])
    store.close()
    peer.callbacks.permission(request)
    expect(store.permissions.value).toEqual([])
  })

  it('caps serialized snapshots and rejects secret-bearing or oversized presets', () => {
    expect(() => validateAgentSettings({ ...snapshot(), presets: [{ id: 'fake', name: 'Fake', command: 'fake', env: { SECRET: 'hidden' } }] })).toThrow()
    const settings = validateAgentSettings(snapshot())
    const statuses = new Map(settings.presets.map(preset => [preset.id, { id: preset.id, name: preset.name, enabled: true, state: 'error' as const, error: '\u0000'.repeat(16000), logs: Array.from({ length: 30 }, () => '\u0000'.repeat(16000)), envKeys: [] }]))
    const agents = projectAgentStatuses(settings, statuses, { fake: { KEY: 'secret' } }, value => value)
    expect(Buffer.byteLength(JSON.stringify({ ...settings, agents }))).toBeLessThan(64 * 1024)
    expect(() => validateAgentSettings({ ...snapshot(), presets: [{ id: 'fake', name: 'Fake', command: 'fake', args: Array.from({ length: 64 }, () => 'x'.repeat(2048)) }] })).toThrow('too large')
  })
})

describe('write-only credential endpoint', () => {
  /** Creates an HTTP-like request stream containing a private JSON body. */
  function request(origin = 'http://localhost:6006', body = { agentId: 'fake', env: { API_KEY: 'private-value' } }) {
    return Object.assign(Readable.from([JSON.stringify(body)]), { method: 'POST', url: AGENT_ENVIRONMENT_PATH, headers: { origin, 'host': 'localhost:6006', 'content-type': 'application/json' } }) as IncomingMessage
  }

  it('rejects wrong origin and read requests before touching private setters', () => {
    expect(isAgentEnvironmentOrigin(request())).toBe(true)
    expect(isAgentEnvironmentOrigin(request('http://evil.example'))).toBe(false)
    expect(isAgentEnvironmentOrigin(request('https://localhost:6006'))).toBe(false)
    expect(isAgentEnvironmentOrigin(request('http://localhost:6006/path'))).toBe(false)
    expect(isAgentEnvironmentOrigin(Object.assign(request(), { method: 'GET' }))).toBe(false)
    expect(isAgentEnvironmentOrigin(request('http://user:password@localhost:6006'))).toBe(false)
  })

  it('writes only accepted active same-origin POSTs and never echoes credentials/errors', async () => {
    let middleware: (request: IncomingMessage, response: any, next: () => void) => void = () => {}
    const setter = vi.fn(async () => {})
    const server = { config: { base: '/nested/' }, middlewares: { use: (callback: typeof middleware) => {
      middleware = callback
    } } }
    let active = true
    installUiHttpRouter(server as never)
    const dispose = registerAgentEnvironment({ mode: 'dev' } as never, server as never, { setEnvironment: setter } as never, () => active)
    /** Resolves when the route closes its mock response. */
    async function run(input: IncomingMessage) {
      const response: { statusCode: number, body?: string, setHeader: ReturnType<typeof vi.fn>, end?: (body?: string) => void } = { statusCode: 200, setHeader: vi.fn() }
      await new Promise<void>((resolve) => {
        response.end = (body) => {
          response.body = body
          resolve()
        }
        input.url = `/nested${AGENT_ENVIRONMENT_PATH}`
        middleware(input, response, resolve)
      })
      return response
    }
    expect((await run(request('http://evil.example'))).statusCode).toBe(403)
    expect(setter).not.toHaveBeenCalled()
    const accepted = await run(request())
    expect(accepted.statusCode).toBe(204)
    expect(accepted.body).toBeUndefined()
    expect(setter).toHaveBeenCalledWith('fake', { API_KEY: 'private-value' })
    setter.mockRejectedValueOnce(new Error('private-value'))
    const failed = await run(request())
    expect(failed.statusCode).toBe(400)
    expect(failed.body).not.toContain('private-value')
    active = false
    expect((await run(request())).statusCode).toBe(404)
    expect(setter).toHaveBeenCalledTimes(2)
    active = true
    dispose()
    expect((await run(request())).statusCode).toBe(404)
  })
})
