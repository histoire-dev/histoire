import type { HistoireSession } from '@histoire/sdk'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { getDevframeRpcClient } from 'devframe/client'
import { initDevframe } from 'devframe/initiate'
import { afterEach, expect, it, vi } from 'vitest'
import { attachDevframe } from '../client/attach.js'
import { createDevframeBridge } from '../node/devframe.js'
import { createMcpEndpoint } from '../node/mcp.js'

/** Discard only connection globals installed by this isolated test suite. */
afterEach(() => {
  for (const key of ['__DEVFRAME_CONNECTION__', '__DEVFRAME_CONNECTION_META__', '__DEVFRAME_CONNECTION_AUTH_TOKEN__']) Reflect.deleteProperty(globalThis, key)
})

const source = { sourceId: 'book', epoch: 'epoch', revision: 'revision', url: 'http://book.example/', mode: 'dev' } as const
const selection = { storyId: 'story', variantId: 'variant' }
const owner = { sourceId: source.sourceId, epoch: source.epoch, revision: source.revision, runtimeId: 'runtime', target: selection }

/** Minimal external SDK surface; real browser/runtime proof is separate. */
function createSession(value: string, beforeRead: (signal: AbortSignal) => Promise<void> = async () => {}, unsubscribe: () => void = () => {}) {
  const snapshot = { source, selection, events: { items: [], droppedCount: 0 }, runtime: { status: 'ready', mountId: 'mount', runtimeId: 'runtime' }, inspection: { variant: { available: true } } }
  return { get debug() {
    throw new Error('Unexpected diagnostics instrumentation')
  }, getSnapshot: () => snapshot, subscribe: () => unsubscribe, inspect: { variant: async ({ signal }: { signal: AbortSignal }) => {
    await beforeRead(signal)
    return ({ mode: 'live', owner, observedAt: '2026-10-28T12:00:00.000Z', durationMs: 1, truncated: false, inspection: 'variant', state: { draft: value }, components: [], propsAvailable: false, omittedValues: 0 })
  } } } as unknown as HistoireSession
}

it('pairs two actual authenticated WebSocket peers, targets each session, and preserves caller resources', async () => {
  const principals = new Map<number, string>()
  const tokens = new Map<string, string>([[randomUUID(), 'alice'], [randomUUID(), 'bob']])
  const bridge = createDevframeBridge({
    identifyPeer: peer => principals.get(peer.meta.id),
    verifyAttachment: async (_peer, identity) => ({ identity, scopes: ['inspection', 'events', 'diagnostics', 'components', 'accessibility', 'highlight'] }),
    isCurrent: () => true,
    authorityVersion: () => 0,
    allowSource: url => url === source.url,
    authorize: async ({ principal, attachment }) => principal === attachment.principal,
  })
  let instance: ReturnType<typeof initDevframe> | undefined
  const clients: Awaited<ReturnType<typeof getDevframeRpcClient>>[] = []
  const server = createServer((request, response) => {
    if (request.url === '/health') {
      response.end('alive')
    }
    else { instance!.nodeMiddleware(request, response) }
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    vi.stubGlobal('location', { origin, href: `${origin}/` })
    instance = initDevframe(bridge.definition, { base: '/nested/histoire/', server, distDir: false, mcp: false, register: false, origin, auth: {
      rpcFunctions: [{ name: 'anonymous:devframe:auth', type: 'action', setup: ctx => ({ handler: () => ({ isTrusted: ctx.rpc.getCurrentRpcSession()?.meta.isTrusted === true }) }) }],
      authorize: (name, session) => name.startsWith('anonymous:') || session.meta.isTrusted === true,
      onConnect(connection, session) {
        const token = new URL(connection.request?.url ?? '/', origin).searchParams.get('devframe_auth_token')
        const principal = token ? tokens.get(token) : undefined
        session.meta.isTrusted = !!principal
        if (principal) principals.set(session.meta.id, principal)
      },
      printBanner() {},
    }, onPeerDisconnect: (_connection, meta) => {
      bridge.onPeerDisconnect(meta)
      principals.delete(meta.id)
    } })
    await instance.ready
    for (const token of tokens.keys()) clients.push(await getDevframeRpcClient({ baseURL: `${origin}/nested/histoire/`, authToken: token, webmcp: false, simpleAuth: false, otpParam: false, callTimeout: 2000 }))
    for (const client of clients) await client.ensureTrusted()
    const grantA = bridge.broker.createGrant({ principal: 'alice', sourceUrl: source.url, scopes: ['inspection'] })
    const grantB = bridge.broker.createGrant({ principal: 'bob', sourceUrl: source.url, scopes: ['inspection'] })
    const denied = await getDevframeRpcClient({ baseURL: `${origin}/nested/histoire/`, authToken: randomUUID(), webmcp: false, simpleAuth: false, otpParam: false, callTimeout: 1000 })
    clients.push(denied)
    const invokeDenied = denied.call as (name: string, input: unknown) => Promise<unknown>
    await expect(invokeDenied('histoire:pair', { grant: grantA.token, sourceUrl: source.url, identity: { ...owner, projectId: 'project', mountId: 'mount' }, scopes: ['inspection'], method: `histoire:attachment:${randomUUID()}` })).rejects.toThrow()
    let hold = false
    let started = () => {}
    let stopped = () => {}
    const called = new Promise<void>((resolve) => {
      started = resolve
    })
    const cancelled = new Promise<void>((resolve) => {
      stopped = resolve
    })
    const a = await attachDevframe({ session: createSession('alice draft', async (signal) => {
      if (!hold) return
      started()
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => {
        stopped()
        reject(new Error('cancelled'))
      }, { once: true }))
    }), connection: clients[0], grant: grantA.token, projectId: 'project' })
    const b = await attachDevframe({ session: createSession('bob draft'), connection: clients[1], grant: grantB.token, projectId: 'project' })
    const args = { kind: 'variant', target: selection, expectedOwner: owner }
    expect((await bridge.broker.call('alice', a.attachment.attachmentId, 'histoire_inspect_session', args) as any).state.draft).toBe('alice draft')
    expect((await bridge.broker.call('bob', b.attachment.attachmentId, 'histoire_inspect_session', args) as any).state.draft).toBe('bob draft')
    await expect(bridge.broker.call('bob', a.attachment.attachmentId, 'histoire_inspect_session', args)).rejects.toThrow('Session unavailable')
    hold = true
    const abort = new AbortController()
    const pending = bridge.broker.call('alice', a.attachment.attachmentId, 'histoire_inspect_session', args, abort.signal)
    const rejected = expect(pending).rejects.toThrow('Cancelled')
    await called
    abort.abort()
    await rejected
    await cancelled
    await a.dispose()
    expect(await bridge.broker.list('alice')).toEqual([])
    expect((await bridge.broker.call('bob', b.attachment.attachmentId, 'histoire_inspect_session', args) as any).state.draft).toBe('bob draft')
    await b.dispose()
    expect(bridge.getStatus().attachments).toBe(0)
    const eventGrant = bridge.broker.createGrant({ principal: 'alice', sourceUrl: source.url, scopes: ['events'] })
    const eventSnapshot = { source, selection, runtime: { status: 'ready', mountId: 'mount', runtimeId: 'runtime' }, events: { items: [{ sequence: 4, timestamp: 4, runtimeId: 'runtime', target: selection, payload: { action: 'clicked' } }], droppedCount: 2 } }
    const observers = new Set<(value: any) => void>()
    const eventSession = { get debug() {
      throw new Error('Unexpected diagnostics instrumentation')
    }, getSnapshot: () => eventSnapshot, subscribe: (listener: (value: any) => void) => {
      observers.add(listener)
      return () => observers.delete(listener)
    }, inspect: {} } as unknown as HistoireSession
    const eventAttachment = await attachDevframe({ session: eventSession, connection: clients[0], grant: eventGrant.token, projectId: 'project', scopes: ['events'] })
    const endpoint = createMcpEndpoint(bridge.broker, request => request.headers.get('authorization') === 'Bearer alice' ? 'alice' : undefined)
    const agent = new Client({ name: 'test-agent', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
    try {
      await agent.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), { fetch: (input, init) => endpoint.fetch(new Request(input, init)), requestInit: { headers: { authorization: 'Bearer alice' } } }))
      const eventResult = await agent.callTool({ name: 'histoire_get_session_events', arguments: { attachmentId: eventAttachment.attachment.attachmentId, target: selection, expectedOwner: owner } })
      expect(eventResult.isError).not.toBe(true)
      expect((eventResult.structuredContent as any).items).toEqual([{ sequence: 4, timestamp: 4, runtimeId: 'runtime', target: selection, payload: { action: 'clicked' } }])
      const eventLifetime = (eventResult.structuredContent as any).eventLifetime
      eventSnapshot.events = { items: [5, 6].map(sequence => ({ sequence, timestamp: sequence, runtimeId: 'runtime', target: selection, payload: { action: 'x'.repeat(35_000) } })), droppedCount: 2 }
      for (const observer of observers) observer(eventSnapshot)
      const firstPage = await agent.callTool({ name: 'histoire_get_session_events', arguments: { attachmentId: eventAttachment.attachment.attachmentId, target: selection, expectedOwner: owner, eventLifetime } })
      expect((firstPage.structuredContent as any).items.map((item: any) => item.sequence)).toEqual([5])
      expect((firstPage.structuredContent as any).nextSequence).toBe(5)
      const nextPage = await agent.callTool({ name: 'histoire_get_session_events', arguments: { attachmentId: eventAttachment.attachment.attachmentId, target: selection, expectedOwner: owner, afterSequence: 5, eventLifetime } })
      expect((nextPage.structuredContent as any).items.map((item: any) => item.sequence)).toEqual([6])
      eventSnapshot.events = { items: [], droppedCount: 0 }
      for (const observer of observers) observer(eventSnapshot)
      const stale = await agent.callTool({ name: 'histoire_get_session_events', arguments: { attachmentId: eventAttachment.attachment.attachmentId, target: selection, expectedOwner: owner, afterSequence: 4, eventLifetime } })
      expect(stale.structuredContent).toEqual({ ok: false, error: { code: 'STALE_REVISION', message: 'Event history lifetime unavailable' } })
      const inspection = await agent.callTool({ name: 'histoire_inspect_session', arguments: { attachmentId: eventAttachment.attachment.attachmentId, ...args } })
      expect(inspection.isError).toBe(true)
    }
    finally {
      await agent.close()
      await endpoint.close()
      await eventAttachment.dispose()
    }
    expect(bridge.getStatus().attachments).toBe(0)
    let diagnosticStopped = () => {}
    let loseObservation = (_reason: Error) => {}
    const lostObservation = new Promise<void>((_resolve, reject) => {
      loseObservation = reject
    })
    const stoppedObservation = new Promise<void>((resolve) => {
      diagnosticStopped = resolve
    })
    const diagnosticSnapshot = { source, selection, runtime: { status: 'ready', mountId: 'mount', runtimeId: 'runtime' }, events: { items: [], droppedCount: 0 }, inspection: { diagnostics: { available: true } } }
    const diagnosticSession = {
      getSnapshot: () => diagnosticSnapshot,
      subscribe: () => () => {},
      debug: {
        subscribe: () => ({ ready: Promise.resolve(), closed: lostObservation, unsubscribe: async () => { diagnosticStopped() } }),
        getSnapshot: () => ({ items: [{ sequence: 1, timestamp: 1, monotonicTimeMs: 1, kind: 'console', message: 'message', owner }], nextSequence: 1, oldestSequence: 1, droppedCount: 0, gap: false }),
      },
      inspect: {},
    } as unknown as HistoireSession
    const diagnosticGrant = bridge.broker.createGrant({ principal: 'alice', sourceUrl: source.url, scopes: ['diagnostics'] })
    const diagnosticAttachment = await attachDevframe({ session: diagnosticSession, connection: clients[0], grant: diagnosticGrant.token, projectId: 'project', scopes: ['diagnostics'] })
    const diagnosticEndpoint = createMcpEndpoint(bridge.broker, () => 'alice')
    const diagnosticAgent = new Client({ name: 'test-agent', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
    try {
      await diagnosticAgent.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), { fetch: (input, init) => diagnosticEndpoint.fetch(new Request(input, init)) }))
      const request = { attachmentId: diagnosticAttachment.attachment.attachmentId, target: selection, expectedOwner: owner }
      const diagnosticResult = await diagnosticAgent.callTool({ name: 'histoire_get_session_diagnostics', arguments: request })
      expect((diagnosticResult.structuredContent as any).items.map((item: any) => item.message)).toEqual(['message'])
      loseObservation(new Error('SOURCE_UNAVAILABLE'))
      await stoppedObservation
      const afterLoss = await diagnosticAgent.callTool({ name: 'histoire_get_session_diagnostics', arguments: request })
      expect(afterLoss.isError).toBe(true)
      expect(afterLoss.structuredContent).toMatchObject({ ok: false, error: { code: 'SESSION_UNAVAILABLE' } })
    }
    finally {
      await diagnosticAgent.close()
      await diagnosticEndpoint.close()
      await diagnosticAttachment.dispose()
    }
    expect(bridge.getStatus().attachments).toBe(0)
    const base = { mode: 'live', owner, observedAt: '2026-10-28T12:00:00.000Z', durationMs: 1, truncated: false } as const
    const node = { id: 'component', parentId: null, name: 'Widget', framework: 'vue' }
    const highlighted: unknown[] = []
    const componentSession = {
      getSnapshot: () => ({ source, selection, runtime: { status: 'ready', mountId: 'mount', runtimeId: 'runtime' }, inspection: { components: { available: true }, componentDetails: { available: true }, accessibilityAudit: { available: true }, highlight: { available: true }, highlightLease: { available: true }, componentHighlight: { available: true } } }),
      subscribe: () => () => {},
      inspect: {
        components: async () => ({ ...base, inspection: 'components', coverage: 'complete', limitations: [], nodes: [node], omittedCount: 0 }),
        component: async () => ({ ...base, inspection: 'component', coverage: 'complete', limitations: [], node, props: { label: 'draft' }, selectors: [], omittedValues: 0 }),
        highlightLease: async ({ signal: _signal, ...options }: any) => {
          highlighted.push(options)
          return { owner, observedAt: '2026-10-28T12:00:00.000Z', leaseId: 'lease' }
        },
        clearHighlight: async () => ({ owner, observedAt: '2026-10-28T12:00:00.000Z', cleared: true }),
        accessibility: async () => ({ ...base, inspection: 'accessibility', matched: true, engine: 'axe-core', engineVersion: '4.14.0', violations: [], incomplete: [], passesCount: 1, inapplicableCount: 0, droppedCount: 0 }),
      },
    } as unknown as HistoireSession
    const componentGrant = bridge.broker.createGrant({ principal: 'alice', sourceUrl: source.url, scopes: ['components', 'accessibility', 'highlight'] })
    const componentAttachment = await attachDevframe({ session: componentSession, connection: clients[0], grant: componentGrant.token, projectId: 'project', scopes: ['components', 'accessibility', 'highlight'] })
    const componentEndpoint = createMcpEndpoint(bridge.broker, request => request.headers.get('authorization') === 'Bearer alice' ? 'alice' : undefined)
    const componentAgent = new Client({ name: 'test-agent', version: '1' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } })
    try {
      await componentAgent.connect(new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), { fetch: (input, init) => componentEndpoint.fetch(new Request(input, init)), requestInit: { headers: { authorization: 'Bearer alice' } } }))
      expect((await componentAgent.listTools()).tools.map(item => item.name)).toEqual(['histoire_inspect_component', 'histoire_audit_session_accessibility', 'histoire_highlight_element'])
      const request = { attachmentId: componentAttachment.attachment.attachmentId, target: selection, expectedOwner: owner }
      const tree = await componentAgent.callTool({ name: 'histoire_inspect_component', arguments: request })
      expect(tree.structuredContent).toMatchObject({ inspection: 'components', nodes: [{ id: 'component' }] })
      const detail = await componentAgent.callTool({ name: 'histoire_inspect_component', arguments: { ...request, componentId: 'component' } })
      expect(detail.structuredContent).toMatchObject({ inspection: 'component', props: { label: 'draft' } })
      const audit = await componentAgent.callTool({ name: 'histoire_audit_session_accessibility', arguments: request })
      expect(audit.structuredContent).toMatchObject({ inspection: 'accessibility', engine: 'axe-core' })
      const highlight = await componentAgent.callTool({ name: 'histoire_highlight_element', arguments: { ...request, selector: '#target' } })
      expect(highlight.structuredContent).toMatchObject({ owner })
      const componentHighlight = await componentAgent.callTool({ name: 'histoire_highlight_element', arguments: { ...request, componentId: 'component' } })
      expect(componentHighlight.structuredContent).toMatchObject({ owner })
      expect(highlighted).toEqual([{ target: selection, expectedOwner: owner, selector: '#target' }, { target: selection, expectedOwner: owner, componentId: 'component' }])
    }
    finally {
      await componentAgent.close()
      await componentEndpoint.close()
      await componentAttachment.dispose()
    }
    // Attachment disposal joins a lease returned just as cancellation begins.
    const lateStarted = Promise.withResolvers<void>()
    const lateLease = Promise.withResolvers<any>()
    const clearStarted = Promise.withResolvers<void>()
    const clearGate = Promise.withResolvers<void>()
    const lateSession = {
      getSnapshot: () => ({ source, selection, runtime: { status: 'ready', mountId: 'mount', runtimeId: 'runtime' }, inspection: { highlight: { available: true }, highlightLease: { available: true } } }),
      subscribe: () => () => {},
      inspect: {
        highlightLease: async () => {
          lateStarted.resolve()
          return lateLease.promise
        },
        clearHighlight: async () => {
          clearStarted.resolve()
          await clearGate.promise
          return { owner, cleared: true }
        },
      },
    } as unknown as HistoireSession
    const lateGrant = bridge.broker.createGrant({ principal: 'alice', sourceUrl: source.url, scopes: ['highlight'] })
    const lateAttachment = await attachDevframe({ session: lateSession, connection: clients[0], grant: lateGrant.token, projectId: 'project', scopes: ['highlight'] })
    try {
      const pending = bridge.broker.call('alice', lateAttachment.attachment.attachmentId, 'histoire_highlight_element', { kind: 'highlight', target: selection, expectedOwner: owner, selector: '#target' }).catch(() => {})
      await lateStarted.promise
      lateLease.resolve({ owner, observedAt: '2026-10-28T12:00:00.000Z', leaseId: 'late' })
      let disposed = false
      const disposal = lateAttachment.dispose().then(() => {
        disposed = true
      })
      await clearStarted.promise
      await Promise.resolve()
      expect(disposed).toBe(false)
      clearGate.resolve()
      await disposal
      expect(disposed).toBe(true)
      await pending
    }
    finally {
      clearGate.resolve()
      lateLease.resolve(undefined)
      await lateAttachment.dispose()
    }
    for (let index = 0; index < 3; index++) {
      let retired = false
      const oldGrant = bridge.broker.createGrant({ principal: 'alice', sourceUrl: source.url, scopes: ['inspection'] })
      const oldSession = createSession('old', undefined, () => {
        retired = true
      })
      const old = await attachDevframe({ session: oldSession, connection: clients[0], grant: oldGrant.token, projectId: 'project' })
      // Lease expiry uses the same server retirement path. Observe it on the client.
      bridge.invalidate(old.attachment.attachmentId)
      await vi.waitFor(() => expect(retired).toBe(true))
      expect(bridge.getStatus().attachments).toBe(0)
      const freshGrant = bridge.broker.createGrant({ principal: 'alice', sourceUrl: source.url, scopes: ['inspection'] })
      const fresh = await attachDevframe({ session: createSession('fresh'), connection: clients[0], grant: freshGrant.token, projectId: 'project' })
      await old.dispose()
      expect((await bridge.broker.call('alice', fresh.attachment.attachmentId, 'histoire_inspect_session', args) as any).state.draft).toBe('fresh')
      expect(bridge.getStatus().attachments).toBe(1)
      await fresh.dispose()
      expect(bridge.getStatus().attachments).toBe(0)
    }
    await bridge.dispose()
    expect((await (clients[1].call as (name: string) => Promise<{ isTrusted: boolean }>)('anonymous:devframe:auth')).isTrusted).toBe(true)
    expect(await (await fetch(`${origin}/health`)).text()).toBe('alive')
  }
  finally {
    try {
      await bridge.dispose()
    }
    finally {
      clients.forEach(client => client.close?.())
      await instance?.close()
      if (server.listening) {
        await new Promise<void>((resolve) => {
          server.close(() => resolve())
          server.closeAllConnections()
        })
      }
      vi.unstubAllGlobals()
    }
  }
})

it('reports unconfirmed diagnostic cleanup while preserving the caller server and connection', async () => {
  const token = randomUUID()
  const principals = new Map<number, string>()
  const bridge = createDevframeBridge({
    timeoutMs: 200,
    identifyPeer: peer => principals.get(peer.meta.id),
    verifyAttachment: async (_peer, identity) => ({ identity, scopes: ['diagnostics'] }),
    isCurrent: () => true,
    authorityVersion: () => 0,
    allowSource: url => url === source.url,
    authorize: async () => true,
  })
  let instance: ReturnType<typeof initDevframe> | undefined
  let client: Awaited<ReturnType<typeof getDevframeRpcClient>> | undefined
  const server = createServer((request, response) => {
    if (request.url === '/health') response.end('alive')
    else instance!.nodeMiddleware(request, response)
  })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
    vi.stubGlobal('location', { origin, href: `${origin}/` })
    instance = initDevframe(bridge.definition, { base: '/nested/histoire/', server, distDir: false, mcp: false, register: false, origin, auth: {
      rpcFunctions: [{ name: 'anonymous:devframe:auth', type: 'action', setup: ctx => ({ handler: () => ({ isTrusted: ctx.rpc.getCurrentRpcSession()?.meta.isTrusted === true }) }) }],
      authorize: (name, session) => name.startsWith('anonymous:') || session.meta.isTrusted === true,
      onConnect(connection, session) {
        session.meta.isTrusted = new URL(connection.request?.url ?? '/', origin).searchParams.get('devframe_auth_token') === token
        if (session.meta.isTrusted) principals.set(session.meta.id, 'alice')
      },
      printBanner() {},
    }, onPeerDisconnect: (_connection, meta) => bridge.onPeerDisconnect(meta) })
    await instance.ready
    client = await getDevframeRpcClient({ baseURL: `${origin}/nested/histoire/`, authToken: token, webmcp: false, simpleAuth: false, otpParam: false, callTimeout: 2000 })
    await client.ensureTrusted()
    const diagnosticSession = {
      getSnapshot: () => ({ source, selection, runtime: { status: 'ready', mountId: 'mount', runtimeId: 'runtime' }, inspection: { diagnostics: { available: true } } }),
      subscribe: () => () => {},
      debug: { subscribe: () => ({ ready: Promise.resolve(), closed: new Promise<void>(() => {}), unsubscribe: async () => { throw new Error('secret from runtime') } }) },
      inspect: {},
    } as unknown as HistoireSession
    const grant = bridge.broker.createGrant({ principal: 'alice', sourceUrl: source.url, scopes: ['diagnostics'] })
    const attachment = await attachDevframe({ session: diagnosticSession, connection: client, grant: grant.token, projectId: 'project', scopes: ['diagnostics'] })
    const failure = await bridge.dispose().catch(error => error)
    expect(failure.message).toBe('Attachment retirement incomplete')
    await expect(attachment.dispose()).rejects.toThrow('Attachment cleanup incomplete')
    expect((await (client.call as (name: string) => Promise<{ isTrusted: boolean }>)('anonymous:devframe:auth')).isTrusted).toBe(true)
    expect(await (await fetch(`${origin}/health`)).text()).toBe('alive')
  }
  finally {
    await bridge.dispose().catch(() => {})
    client?.close?.()
    await instance?.close()
    if (server.listening) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
    }
    vi.unstubAllGlobals()
  }
})
