import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createExecutionService } from '../runtime/execution-service.js'
import { createHistoireTestTask } from '../test/execution-service.js'

/**
 * Behaviour of the dev-server `histoire:dev-event` handler, driven through a
 * fake Vite websocket: the UI is left stuck on "Running…" forever whenever a
 * request goes unanswered, and an escaping rejection takes the dev server down
 * with it (the handler is an async `ws.on` callback).
 */
describe('dev-event handler', () => {
  let registerDevEvents: typeof import('../server/dev-events.js').registerDevEvents
  let runHistoireTests: ReturnType<typeof vi.fn>

  /** Fake Vite dev server capturing the registered websocket handler. */
  function createServer() {
    const handlers = new Map<string, (payload: any, client: any) => any>()

    return {
      ws: {
        on: (event: string, handler: (payload: any, client: any) => any) => handlers.set(event, handler),
        send: vi.fn(),
      },
      emit: (payload: any, client: any) => handlers.get('histoire:dev-event')!(payload, client),
    }
  }

  /** Fake websocket client recording what was replied to it. */
  function createClient() {
    return { send: vi.fn() }
  }

  function createContext(plugins: any[] = []) {
    return { config: { plugins }, storyFiles: [], markdownFiles: [] } as any
  }

  /** Registers the handler on a fresh fake server and returns both. */
  function register(ctx = createContext(), execution?: ReturnType<typeof createExecutionService>, isActive = () => true) {
    const server = createServer()
    registerDevEvents(ctx, server as any, {} as any, execution, isActive)
    return server
  }

  beforeEach(async () => {
    vi.resetModules()
    runHistoireTests = vi.fn(async () => ({ ok: true }))
    vi.doMock('../test/index.js', () => ({ runHistoireTests }))
    ;({ registerDevEvents } = await import('../server/dev-events.js'))
  })

  it('replies the run summary to the requesting client only', async () => {
    const server = register()
    const client = createClient()

    await server.emit({ event: 'runStoryTests', payload: { storyId: 'story', variantId: 'variant' }, requestId: 7 }, client)

    // Request ids are per-client counters, so a broadcast reply could settle
    // another tab's pending request that happens to share the same id.
    expect(server.ws.send).not.toHaveBeenCalled()
    expect(client.send).toHaveBeenCalledWith('histoire:dev-event-result', {
      event: 'runStoryTests',
      requestId: 7,
      result: { ok: true },
    })
  })

  it('runs the tests against the live dev context without re-scanning it', async () => {
    const server = register()

    // A re-scan resets ctx.storyFiles and duplicates ctx.markdownFiles, which
    // collapses the story tree of the running dev server. The websocket payload
    // must also not be able to inject extra run options (raw vitest args would
    // let any client point the run at another config module).
    await server.emit({
      event: 'runStoryTests',
      payload: { storyId: 'story', variantId: 'variant', rawVitestArgs: ['--config', 'evil.mjs'] },
      requestId: 1,
    }, createClient())

    expect(runHistoireTests).toHaveBeenCalledWith(expect.anything(), {
      storyId: 'story',
      variantId: 'variant',
      skipStoryScan: true,
      signal: expect.any(AbortSignal),
      strictCleanup: true,
    })
  })

  it('answers a failed run with a serialized error instead of leaving it pending', async () => {
    runHistoireTests.mockRejectedValueOnce(new Error('run exploded'))
    const server = register()
    const client = createClient()

    await expect(server.emit({ event: 'runStoryTests', requestId: 3 }, client)).resolves.not.toThrow()

    const [, reply] = client.send.mock.calls[0]
    expect(reply.requestId).toBe(3)
    expect(reply.error).toContain('run exploded')
  })

  it('gives every request its own run and never wedges the queue on a failure', async () => {
    runHistoireTests
      .mockRejectedValueOnce(new Error('first run exploded'))
      .mockResolvedValueOnce({ ok: true, storyId: 'second' })
    const server = register()
    const first = createClient()
    const second = createClient()

    await Promise.all([
      server.emit({ event: 'runStoryTests', payload: { storyId: 'first' }, requestId: 1 }, first),
      server.emit({ event: 'runStoryTests', payload: { storyId: 'second' }, requestId: 2 }, second),
    ])

    // A single-flight latch would answer the second request with the first
    // request's outcome (filtered to another story).
    expect(first.send.mock.calls[0][1].error).toContain('first run exploded')
    expect(second.send.mock.calls[0][1].result).toEqual({ ok: true, storyId: 'second' })
  })

  it('serializes UI and MCP through one lane with each request own target and summary', async () => {
    const execution = createExecutionService()
    const ctx = createContext()
    const server = register(ctx, execution)
    const order: string[] = []
    let release!: () => void
    runHistoireTests.mockImplementation(async (_context, options) => {
      order.push(options.storyId)
      if (options.storyId === 'ui-a') {
        await new Promise<void>((done) => {
          release = done
        })
      }
      return { ok: true, storyId: options.storyId }
    })
    const first = createClient()
    const third = createClient()
    const a = server.emit({ event: 'runStoryTests', payload: { storyId: 'ui-a' }, requestId: 1 }, first)
    const b = execution.enqueue(createHistoireTestTask(ctx, { storyId: 'mcp-b' })).result
    const c = server.emit({ event: 'runStoryTests', payload: { storyId: 'ui-c' }, requestId: 3 }, third)
    await vi.waitFor(() => expect(order).toEqual(['ui-a']))
    release()
    await Promise.all([a, b, c])
    expect(order).toEqual(['ui-a', 'mcp-b', 'ui-c'])
    expect(await b).toEqual({ ok: true, storyId: 'mcp-b' })
    expect(first.send.mock.calls[0][1].result.storyId).toBe('ui-a')
    expect(third.send.mock.calls[0][1].result.storyId).toBe('ui-c')
    await execution.close()
  })

  it('suppresses completion feedback after captured runtime becomes inactive', async () => {
    let active = true
    runHistoireTests.mockImplementationOnce(async () => {
      active = false
      return { ok: true }
    })
    const server = register(createContext(), undefined, () => active)
    const client = createClient()
    await server.emit({ event: 'runStoryTests', payload: { storyId: 'old' }, requestId: 1 }, client)
    expect(client.send).not.toHaveBeenCalled()
  })

  it('answers a failing plugin dev event instead of escaping the callback', async () => {
    const ctx = createContext([{
      onDevEvent: vi.fn(async () => {
        throw new Error('plugin exploded')
      }),
    }])
    const server = register(ctx)
    const client = createClient()

    await expect(server.emit({ event: 'customEvent', requestId: 5 }, client)).resolves.not.toThrow()

    expect(client.send.mock.calls[0][1]).toMatchObject({
      event: 'customEvent',
      requestId: 5,
    })
    expect(client.send.mock.calls[0][1].error).toContain('plugin exploded')
  })

  it('drops a malformed event instead of throwing on it', async () => {
    const onDevEvent = vi.fn()
    const server = register(createContext([{ onDevEvent }]))
    const client = createClient()

    // The payload comes from the browser: `event` is read as a string.
    await expect(server.emit({ payload: {} }, client)).resolves.not.toThrow()
    await expect(server.emit({ event: 42 }, client)).resolves.not.toThrow()
    await expect(server.emit(undefined, client)).resolves.not.toThrow()

    expect(onDevEvent).not.toHaveBeenCalled()
    expect(client.send).not.toHaveBeenCalled()
  })
})
