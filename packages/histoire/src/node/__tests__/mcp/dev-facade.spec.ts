import type { ProjectRuntimeHandle, ProjectRuntimeStatus } from '../../runtime/types.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDevMcpProject } from '../../mcp/project/dev-facade.js'
import { mcpProjectSchema } from '../../mcp/protocol/project-schema.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createReadProjectFixture } from '../utils/mcp/read-project.js'

describe('generation-owned dev MCP facade', () => {
  const close: (() => unknown | Promise<unknown>)[] = []
  afterEach(async () => {
    await Promise.all(close.splice(0).reverse().map(fn => fn()))
  })
  /** Control lifecycle without sockets, collection workers, or optional module loading. */
  async function fixture() {
    const value = await createReadProjectFixture()
    close.push(value.close)
    let active = true
    const readiness = deferred<void>()
    const handle: ProjectRuntimeHandle = {
      context: { ...value.context, config: { theme: { title: 'Fixture' }, routerMode: 'history' } as any },
      server: { config: { base: '/book/' }, resolvedUrls: { local: ['http://localhost:7482/book/'], network: [] } } as any,
      epoch: '00000000-0000-4000-8000-000000000001',
      ready: readiness.promise,
      isActive: () => active,
      close: async () => {},
      collect: async () => {},
      onCollection: () => () => {},
    }
    const subscribers = new Set<() => void>()
    const controller = {
      current: handle as ProjectRuntimeHandle | undefined,
      status: 'starting' as ProjectRuntimeStatus,
      subscribe(callback: () => void) {
        subscribers.add(callback)
        return () => subscribers.delete(callback)
      },
    }
    const project = createDevMcpProject({ controller, projectId: value.project.projectId })
    close.push(() => project.close())
    return {
      project,
      controller,
      handle,
      /** Finish initial publication without browser execution. */
      async ready(expected: 'ready' | 'failed' = 'ready') {
        controller.status = 'ready'
        readiness.resolve()
        subscribers.forEach(callback => callback())
        await expect.poll(() => project.getProject().status).toBe(expected)
      },
      /** Invalidate active ownership synchronously, before slow cleanup. */
      restart() {
        active = false
        controller.current = undefined
        controller.status = 'restarting'
        subscribers.forEach(callback => callback())
      },
    }
  }

  it('reads starting lifecycle, rejects early catalog reads, then exposes actual UI origin', async () => {
    const { project, ready } = await fixture()
    expect(mcpProjectSchema.safeParse(project.getProject()).success).toBe(true)
    expect(project.getProject().status).toBe('starting')
    expect(() => project.getStory({ storyId: 'story' })).toThrow(/starting/)
    await ready()
    expect(project.getProject()).toMatchObject({ status: 'ready', storyCount: 1, variantCount: 1, base: '/book/' })
    expect(project.getPreview({ storyId: 'story', variantId: 'shared/? #%' })).toMatchObject({ sandboxUrl: 'http://localhost:7482/book/__sandbox.html?storyId=story&variantId=shared%2F%3F+%23%25' })
    expect(project.capture().handle).toBeDefined()
  })

  it('rejects successful late content completion after runtime ownership changes', async () => {
    const { project, ready, restart } = await fixture()
    await ready()
    const captured = project.capture()
    const result = await captured.content.getDocs({ storyId: 'story' })
    const pending = deferred<typeof result>()
    vi.spyOn(captured.content, 'getDocs').mockReturnValue(pending.promise)
    const read = project.getDocs({ storyId: 'story', offset: 0, limit: 100 })
    const rejection = expect(read).rejects.toMatchObject({ code: 'STALE_REVISION' })
    restart()
    pending.resolve(result)
    await rejection
    expect(project.getProject().status).toBe('restarting')
    expect(() => project.getStory({ storyId: 'story' })).toThrow(/restarting/)
  })

  it('distinguishes startup failure and close without exposing raw private failure', async () => {
    const { project, controller } = await fixture()
    controller.status = 'failed'
    expect(project.getProject().status).toBe('failed')
    expect(() => project.getStory({ storyId: 'story' })).toThrow(/failed/)
    project.close()
    expect(project.getProject()).toMatchObject({ status: 'closed', storyCount: 0 })
    expect(() => project.capture()).toThrow(/closed/)
  })

  it('rejects a content page when same generation publishes a new revision during read', async () => {
    const { project, ready, handle } = await fixture()
    await ready()
    const captured = project.capture()
    const result = await captured.content.getSource({ storyId: 'story' })
    const pending = deferred<typeof result>()
    vi.spyOn(captured.content, 'getSource').mockReturnValue(pending.promise)
    const read = project.getSource({ storyId: 'story', startLine: 1, lineCount: 100 })
    const rejection = expect(read).rejects.toMatchObject({ code: 'STALE_REVISION' })
    handle.context.storyFiles[0].moduleCode = 'changed virtual source'
    await captured.catalog.publish(handle.context)
    pending.resolve(result)
    await rejection
    expect(project.getProject().status).toBe('ready')
  })

  it('exposes catalog initialization failure without throwing away lifecycle access', async () => {
    const { project, ready, handle } = await fixture()
    handle.context.storyFiles[0].treePath = {} as any
    await ready('failed')
    expect(project.getProject()).toMatchObject({ status: 'failed', diagnostics: [{ code: 'COLLECTION_FAILED', message: 'Project catalog initialization failed' }] })
    expect(() => project.getStory({ storyId: 'story' })).toThrow(/failed/)
  })
})
