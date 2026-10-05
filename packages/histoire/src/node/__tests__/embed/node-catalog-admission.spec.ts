import type { ProjectServices } from '../../api/internal.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureProjectScreenshot } from '../../api/capture.js'
import { runProjectTests } from '../../api/tests.js'
import { createRuntimeCatalog } from '../../runtime/catalog/publication.js'
import { createExecutionOwner } from '../../runtime/execution-owner.js'
import { createExecutionService } from '../../runtime/execution-service.js'
import { closeDevPreviewHost, createMcpPreviewHtmlMiddleware } from '../../vite/mcp-preview-html.js'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory, MCP_PROJECT_OPTIONS } from '../utils/mcp/project.js'

const tests = vi.hoisted(() => vi.fn(async () => ({ ok: true, total: 0 })))
const capture = vi.hoisted(() => vi.fn(async () => ({ artifact: new Uint8Array([1]), result: { width: 480, height: 320, sha256: 'hash' } })))
vi.mock('../../test/execution-service.js', () => ({ createHistoireTestTask: () => ({ run: tests }) }))
vi.mock('../../runtime/browser/screenshot.js', () => ({ createScreenshotTask: () => ({ run: capture }) }))

describe('completed Node dev execution admission', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  let execution: ReturnType<typeof createExecutionService>
  let catalog: ReturnType<typeof createRuntimeCatalog>
  let services: ProjectServices
  let server: any

  beforeEach(async () => {
    tests.mockClear()
    capture.mockClear()
    fixture = await createMcpProjectFixture()
    const context = createMcpContext(fixture.root, [createMcpStory(fixture.root)])
    context.config = { theme: { defaultColorScheme: 'light' } } as any
    catalog = createRuntimeCatalog({ root: fixture.root, ...MCP_PROJECT_OPTIONS })
    await catalog.publish(context)
    execution = createExecutionService()
    server = { middlewares: {}, config: { base: '/' } }
    createMcpPreviewHtmlMiddleware(server)
    services = { root: fixture.root, execution, dev: {
      handle: { status: 'ready', url: 'http://book.test/' },
      controller: { current: { context, server, epoch: MCP_PROJECT_OPTIONS.epoch, isActive: () => true } },
      catalog,
      execution: createExecutionOwner(execution),
    } } as unknown as ProjectServices
  })
  afterEach(async () => {
    closeDevPreviewHost(server)
    await execution.close()
    await fixture.close()
  })

  /** Both public APIs must reject unavailable source before runner acquisition. */
  function run(kind: 'tests' | 'capture') {
    return kind === 'tests'
      ? runProjectTests(services, { storyId: 'story-a', variantId: 'default' })
      : captureProjectScreenshot(services, { storyId: 'story-a', variantId: 'default' })
  }

  it.each(['tests', 'capture'] as const)('blocks %s admission during update while retained metadata stays readable', async (kind) => {
    const completed = catalog.current
    catalog.markUpdating()
    expect(catalog.current).toBe(completed)
    expect(catalog.getStory('story-a').story.id).toBe('story-a')
    await expect(run(kind)).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' })
    expect(execution.pendingCount).toBe(0)
    expect(tests).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
  })

  it.each(['tests', 'capture'] as const)('blocks queued %s if collection starts before lane head', async (kind) => {
    const release = deferred<void>()
    const blocker = execution.enqueue({ run: () => release.promise })
    await flushMicrotasks()
    const queued = run(kind)
    expect(execution.pendingCount).toBe(1)
    catalog.markUpdating()
    release.resolve()
    await blocker.result
    await expect(queued).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    expect(tests).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
  })

  it('permits exact immutable capture after completed collection', async () => {
    const completed = catalog.current
    await expect(run('capture')).resolves.toMatchObject({ png: new Uint8Array([1]), sha256: 'hash' })
    expect(capture).toHaveBeenCalledOnce()
    expect(catalog.current).toBe(completed)
    expect(Object.isFrozen(completed.catalog)).toBe(true)
    await expect(run('tests')).resolves.toMatchObject({ ok: true })
    expect(tests).toHaveBeenCalledOnce()
  })

  it('discards active capture when collection starts before result publication', async () => {
    const completed = catalog.current
    const result = capture.getMockImplementation()!
    capture.mockImplementationOnce(async () => {
      const captured = await result()
      catalog.markUpdating()
      return captured
    })
    await expect(run('capture')).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    expect(capture).toHaveBeenCalledOnce()
    expect(catalog.current).toBe(completed)
  })
})
