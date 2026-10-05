import { describe, expect, it } from 'vitest'
import { assertEmbedCommandPolicy, projectEmbedDescriptor } from '../../../../../histoire-app/src/embed/commands.js'
import { assertEmbedSurface } from '../../../../../histoire-app/src/embed/surfaces.js'
import { createParentViewSession } from '../../../../../histoire-app/src/embed/view-session.js'
import { sourceFixture } from '../../../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { createHistoireSessionWithAdapters } from '../../../../../histoire-sdk/src/internal.js'
import { createBridgePort } from '../../../../../histoire-sdk/src/transport/port.js'
import { dispatchHistoireSessionCommand } from '../../../../../histoire-sdk/src/transport/session-commands.js'
import { createEmbedPortPair } from '../utils/embed/transport.js'

describe('source policy and parent-backed views', () => {
  it('enforces default cross-origin editor/server denial on every descriptor revision', () => {
    expect(() => assertEmbedSurface('tree')).toThrow('Surface tree unavailable')
    const fixture = sourceFixture()
    fixture.descriptor.embed = { allowedOrigins: [], allowOpenInEditor: false, allowServerTests: false }
    const source = { ...fixture.connection, allowedOrigins: [] }
    for (const revision of ['revision-1', 'revision-2']) {
      fixture.descriptor.revision = revision
      const projected = projectEmbedDescriptor(fixture.descriptor, 'https://host.test', 'https://book.test')
      expect(projected.capabilities).toMatchObject({ openInEditor: { available: false }, serverTests: { available: false } })
      expect(() => assertEmbedCommandPolicy(source, 'https://host.test', 'https://book.test', 'openInEditor', {})).toThrow('Cross-origin editor access disabled')
      expect(() => assertEmbedCommandPolicy(source, 'https://host.test', 'https://book.test', 'tests.run', { mode: 'server' })).toThrow('Cross-origin server tests disabled')
    }
    expect(projectEmbedDescriptor(fixture.descriptor, 'https://book.test', 'https://book.test').capabilities.serverTests.available).toBe(true)
    fixture.descriptor.embed.allowOpenInEditor = true
    fixture.descriptor.embed.allowServerTests = true
    expect(() => assertEmbedCommandPolicy(source, 'https://host.test', 'https://book.test', 'tests.run', { mode: 'server' })).not.toThrow()
  })
  it('routes view intents through one parent controller and never owns/disposes parent runtime', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.test/' }, fixture.adapters)
    await session.connect()
    const ports = createEmbedPortPair()
    const owner = { protocolVersion: 1, sessionId: 'session', connectionId: 'view-connection', mountId: 'view', sourceId: fixture.descriptor.sourceId, epoch: fixture.descriptor.epoch, revision: fixture.descriptor.revision }
    const abort = new AbortController()
    let view: ReturnType<typeof createParentViewSession>
    const parent = createBridgePort({ port: ports.parent as unknown as MessagePort, owner, role: 'view', dispatch: request => dispatchHistoireSessionCommand(session, request.command, request.payload, request) })
    const child = createBridgePort({ port: ports.child as unknown as MessagePort, owner, role: 'view', child: true, dispatch: (request) => {
      view.synchronize(request.payload as any)
      return null
    } })
    view = createParentViewSession(child, abort.signal)
    const sync = () => parent.request('view.sync', session.getSnapshot(), { ...owner, signal: abort.signal })
    const off = session.subscribe(() => {
      void sync().catch(() => {
      })
    })
    try {
      await sync()
      await view.session.selection.select({ storyId: 'a:b', variantId: 'other' })
      expect(session.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'other' })
      expect(view.session.getSnapshot().selection).toEqual(session.getSnapshot().selection)
      await view.session.settings.update({ colorScheme: 'dark' })
      expect(view.session.getSnapshot().settings.colorScheme).toBe('dark')
      expect((await view.session.docs.get('a:b')).body).toContain('Docs')
      expect(fixture.adapters.mount).not.toHaveBeenCalled()
      expect(() => dispatchHistoireSessionCommand(session, 'tests.run', { mode: 'server' }, { ...owner, target: { storyId: 'a', variantId: 'b:c' } })).toThrow('View intent belongs to another target or runtime')
      await view.session.dispose()
      expect(session.getSnapshot().status).toBe('ready')
      expect(() => view.session.createHiddenPreview()).toThrow('Nested runtime mounting unavailable')
    }
    finally {
      off()
      view.close()
      parent.close()
      child.close()
      await session.dispose()
    }
  })
})
