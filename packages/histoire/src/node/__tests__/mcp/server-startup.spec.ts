import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCollectStories } from '../../collect/index.js'
import { createMarkdownFilesWatcher } from '../../markdown.js'
import { createServer } from '../../server/index.js'
import { registerAgentsChannel } from '../../server/ui-channel/agents.js'
import { registerCommentsChannel } from '../../server/ui-channel/comments.js'
import { registerConfigChannel } from '../../server/ui-channel/config.js'
import { registerUiChannel } from '../../server/ui-channel/index.js'
import { createViteServers } from '../../server/vite-servers.js'
import { watchStories } from '../../stories.js'
import { flushMicrotasks } from '../utils/flush.js'
import { deferred } from '../utils/mcp/deferred.js'

vi.mock('../../server/vite-servers.js', () => ({ createViteServers: vi.fn() }))
vi.mock('../../stories.js', () => ({ watchStories: vi.fn(), onStoryChange: () => () => {}, onStoryListChange: () => () => {} }))
vi.mock('../../markdown.js', () => ({ createMarkdownFilesWatcher: vi.fn(), onMarkdownListChange: () => () => {} }))
vi.mock('../../collect/index.js', () => ({ useCollectStories: vi.fn() }))
vi.mock('../../load.js', () => ({ useModuleLoader: () => ({}) }))
vi.mock('../../plugin.js', () => ({ DevPluginApi: class {} }))
vi.mock('../../server/dev-events.js', () => ({ registerDevEvents: vi.fn() }))
// Startup tests own acquisition plumbing. Feature registration is a boundary:
// real ACP/config/comment initialization must not inspect user settings here.
vi.mock('../../server/ui-channel/index.js', () => ({ registerUiChannel: vi.fn() }))
vi.mock('../../server/ui-channel/config.js', () => ({ registerConfigChannel: vi.fn() }))
vi.mock('../../server/ui-channel/agents.js', () => ({ registerAgentsChannel: vi.fn() }))
vi.mock('../../server/ui-channel/comments.js', () => ({ registerCommentsChannel: vi.fn() }))

describe('dev startup ownership', () => {
  let nodeClose: ReturnType<typeof vi.fn>
  let serverClose: ReturnType<typeof vi.fn>
  let storyClose: ReturnType<typeof vi.fn>
  let markdownClose: ReturnType<typeof vi.fn>
  let destroy: ReturnType<typeof vi.fn>
  let channelClose: ReturnType<typeof vi.fn>
  let channel: any
  let server: any

  beforeEach(() => {
    vi.clearAllMocks()
    nodeClose = vi.fn(async () => {})
    serverClose = vi.fn(async () => {})
    storyClose = vi.fn(async () => {})
    markdownClose = vi.fn(async () => {})
    destroy = vi.fn(async () => {})
    channelClose = vi.fn(async () => {})
    channel = { close: channelClose }
    vi.mocked(registerUiChannel).mockReturnValue(channel)
    vi.mocked(registerAgentsChannel).mockReturnValue({} as any)
    server = { close: serverClose, listen: vi.fn(async () => {}), config: { server: {} }, ws: { send: vi.fn() }, moduleGraph: { getModuleById: () => undefined } }
    vi.mocked(createViteServers).mockResolvedValue({ nodeServer: { close: nodeClose } as any, server, viteConfigFile: undefined })
    vi.mocked(watchStories).mockResolvedValue({ ready: Promise.resolve(), close: storyClose } as any)
    vi.mocked(createMarkdownFilesWatcher).mockResolvedValue({ stop: markdownClose } as any)
    vi.mocked(useCollectStories).mockReturnValue({ clearCache: vi.fn(), executeStoryFile: vi.fn(async () => {}), destroy } as any)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  /** Minimal context sufficient to exercise acquisition plumbing. */
  function context(plugins: any[] = []) {
    return { root: '/project', mode: 'dev', config: { plugins }, storyFiles: [], markdownFiles: [] } as any
  }

  it('waits for story scan before associating Markdown and collects after listen', async () => {
    const scanned = deferred()
    const collected = deferred()
    vi.mocked(watchStories).mockResolvedValue({ ready: scanned.promise, close: storyClose } as any)
    const execute = vi.fn(() => collected.promise)
    vi.mocked(useCollectStories).mockReturnValue({ clearCache: vi.fn(), executeStoryFile: execute, destroy } as any)
    const ctx = context()
    ctx.storyFiles.push({ fileName: 'story' })
    const starting = createServer(ctx)
    await flushMicrotasks()
    expect(createMarkdownFilesWatcher).not.toHaveBeenCalled()
    expect(server.listen).not.toHaveBeenCalled()
    expect(registerUiChannel).not.toHaveBeenCalled()
    scanned.resolve()
    const runtime = await starting
    let ready = false
    void runtime.ready.then(() => {
      ready = true
    })
    expect(server.listen).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledOnce()
    const active = vi.mocked(registerUiChannel).mock.calls[0][3]
    expect(registerUiChannel).toHaveBeenCalledWith(ctx, server, expect.any(Object), expect.any(Function))
    expect(registerConfigChannel).toHaveBeenCalledWith(ctx, channel, active)
    expect(registerAgentsChannel).toHaveBeenCalledWith(ctx, channel, server)
    expect(registerCommentsChannel).toHaveBeenCalledWith(ctx, channel, expect.any(Object), active)
    expect(active()).toBe(true)
    expect(ready).toBe(false)
    collected.resolve()
    await runtime.ready
    expect(ready).toBe(true)
    await runtime.close()
    await runtime.close()
    expect(active()).toBe(false)
    for (const close of [nodeClose, serverClose, storyClose, markdownClose, destroy, channelClose]) expect(close).toHaveBeenCalledOnce()
  })

  it.each(['stories', 'markdown', 'plugin', 'listen', 'collector'])('unwinds previously acquired resources after %s startup failure', async (stage) => {
    const failure = new Error(`${stage} failed`)
    if (stage === 'stories') vi.mocked(watchStories).mockRejectedValueOnce(failure)
    if (stage === 'markdown') vi.mocked(createMarkdownFilesWatcher).mockRejectedValueOnce(failure)
    const cleanup = vi.fn()
    const plugins = stage === 'plugin'
      ? [{ onDev: (_api: unknown, onCleanup: (callback: () => void) => void) => {
          onCleanup(cleanup)
          throw failure
        } }]
      : []
    if (stage === 'listen') server.listen.mockRejectedValueOnce(failure)
    if (stage === 'collector') {
      vi.mocked(useCollectStories).mockImplementationOnce(() => {
        throw failure
      })
    }
    await expect(createServer(context(plugins))).rejects.toThrow(`${stage} failed`)
    expect(nodeClose).toHaveBeenCalledOnce()
    expect(serverClose).toHaveBeenCalledOnce()
    expect(storyClose).toHaveBeenCalledTimes(stage === 'stories' ? 0 : 1)
    expect(markdownClose).toHaveBeenCalledTimes(['stories', 'markdown'].includes(stage) ? 0 : 1)
    expect(cleanup).toHaveBeenCalledTimes(stage === 'plugin' ? 1 : 0)
    expect(channelClose).toHaveBeenCalledTimes(['listen', 'collector'].includes(stage) ? 1 : 0)
  })

  it('still closes servers after a plugin cleanup throws', async () => {
    const runtime = await createServer(context([{ onDev: (_api: unknown, onCleanup: (callback: () => void) => void) => onCleanup(() => {
      throw new Error('plugin teardown failed')
    }) }]))
    await runtime.ready
    await expect(runtime.close()).rejects.toThrow('plugin teardown failed')
    for (const close of [nodeClose, serverClose, storyClose, markdownClose, destroy, channelClose]) expect(close).toHaveBeenCalledOnce()
  })

  it('closes acquired servers and watcher when startup scan is cancelled', async () => {
    const scanned = deferred()
    const abort = new AbortController()
    vi.mocked(watchStories).mockResolvedValue({ ready: scanned.promise, close: storyClose } as any)
    const starting = createServer(context(), { signal: abort.signal })
    const rejected = expect(starting).rejects.toThrow('startup cancelled')
    await flushMicrotasks()
    abort.abort(new Error('startup cancelled'))
    await rejected
    expect(nodeClose).toHaveBeenCalledOnce()
    expect(serverClose).toHaveBeenCalledOnce()
    expect(storyClose).toHaveBeenCalledOnce()
    expect(createMarkdownFilesWatcher).not.toHaveBeenCalled()
    expect(server.listen).not.toHaveBeenCalled()
    expect(registerUiChannel).not.toHaveBeenCalled()
    scanned.resolve()
  })
})
