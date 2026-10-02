import type { Context } from '../context.js'
import { STORY_CHANGED_EVENT } from '@histoire/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStoryCollector } from '../server/collect.js'
import { createModuleInvalidators } from '../server/invalidate.js'
import { notifyStoryChange, notifyStoryListChange } from '../stories.js'
import * as VirtualFiles from '../virtual/index.js'
import { flushMicrotasks } from './utils/flush.js'

/**
 * Behavior of the dev-server collection loop and of the module invalidators it
 * drives: both are pure plumbing around a Vite dev server, so they run here
 * against a fake one.
 */

/** Fake Vite dev server recording the messages the collector pushes. */
function createServer() {
  const modules = new Map<string, any>()
  const sent: any[] = []

  return {
    modules,
    sent,
    moduleGraph: {
      getModuleById: (id: string) => modules.get(id),
      invalidateModule: vi.fn((mod: any) => {
        mod.invalidated = true
      }),
    },
    ws: {
      send: (...args: any[]) => {
        sent.push(args.length === 1 ? args[0] : { event: args[0], payload: args[1] })
      },
    },
  }
}

function createContext(storyFiles: any[]): Context {
  return {
    root: '/project',
    config: {} as Context['config'],
    resolvedViteConfig: {} as Context['resolvedViteConfig'],
    mode: 'dev',
    storyFiles,
    supportPlugins: [],
    markdownFiles: [],
    registeredCommands: [],
  }
}

describe('createModuleInvalidators', () => {
  it('pushes a hot update only for the non-silent invalidation', () => {
    const server = createServer()
    server.modules.set('/mod-a', { url: '/mod-a' })
    server.modules.set('/mod-b', { url: '/mod-b' })
    const { invalidateModule, invalidateModuleSilently } = createModuleInvalidators(server as any)

    invalidateModule('/mod-a')
    // The preview runtime is an iframe entry module and does not self-accept:
    // a fabricated js-update would re-execute it inside live iframes.
    invalidateModuleSilently('/mod-b')
    // An unknown module is a no-op, not a crash.
    invalidateModule('/never-loaded')

    expect(server.moduleGraph.invalidateModule).toHaveBeenCalledTimes(2)
    expect(server.sent).toEqual([
      expect.objectContaining({
        type: 'update',
        updates: [expect.objectContaining({ acceptedPath: '/mod-a', path: '/mod-a' })],
      }),
    ])
  })
})

describe('createStoryCollector', () => {
  let server: ReturnType<typeof createServer>

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    server = createServer()
  })

  /** Wires a collector over the fake server, with one story file. */
  function createCollector(storyFile: any) {
    const ctx = createContext([storyFile])
    const invalidated: string[] = []
    const collector = createStoryCollector({
      ctx,
      server: server as any,
      collectStories: {
        clearCache: vi.fn(),
        executeStoryFile: vi.fn(async () => {}),
      },
      invalidateModule: (id: string) => invalidated.push(id),
      invalidateModuleSilently: (id: string) => invalidated.push(`silent:${id}`),
    })

    return { collector, invalidated }
  }

  it('announces a changed story only after the virtual modules are invalidated', async () => {
    const storyFile = { fileName: 'a', relativePath: 'src/a.story.vue', virtual: true, moduleCode: '', story: { id: 'story-a' } }
    const { collector, invalidated } = createCollector(storyFile)

    // Full pass first: per-file changes are queued only once every story loaded.
    await collector.collect()
    notifyStoryChange(storyFile as any)
    await vi.waitFor(() => expect(server.sent.some(message => message.event === STORY_CHANGED_EVENT)).toBe(true))

    // The app reloads the preview iframe on this event, and the fresh iframe
    // re-imports the preview runtime — which bakes the story metadata at
    // transform time, so it must have been invalidated first.
    expect(invalidated).toContain(`silent:${VirtualFiles.RESOLVED_PREVIEW_RUNTIME_ID}`)
    expect(invalidated).toContain(VirtualFiles.getResolvedStorySourceId('story-a'))
    const changed = server.sent.find(message => message.event === STORY_CHANGED_EVENT)
    expect(changed.payload).toEqual({ storyId: 'story-a', hasVitestMocks: false })

    collector.stop()
  })

  it('stops collecting once the server closed', async () => {
    const storyFile = { fileName: 'a', relativePath: 'src/a.story.vue', virtual: true, moduleCode: '', story: { id: 'story-a' } }
    const { collector } = createCollector(storyFile)

    await collector.collect()
    const sentBefore = server.sent.length
    // A pending debounce (or a listener left behind) would collect into the
    // closed server, and the module-global listener list would keep it alive.
    collector.stop()
    notifyStoryChange(storyFile as any)
    await flushMicrotasks()
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(server.sent).toHaveLength(sentBefore)
  })

  it('suppresses progress, invalidation and publication after in-flight stop', async () => {
    let finish: () => void
    const execution = new Promise<void>((resolve) => {
      finish = resolve
    })
    const invalidated = vi.fn()
    const published = vi.fn()
    const executeStoryFile = vi.fn(() => execution)
    const collector = createStoryCollector({
      ctx: createContext([{ fileName: 'pending' }]),
      server: server as any,
      collectStories: { clearCache: vi.fn(), executeStoryFile } as any,
      invalidateModule: invalidated,
      invalidateModuleSilently: invalidated,
    })
    collector.onCollection(published)
    const first = collector.collect()
    expect(collector.collect()).toBe(first)
    await flushMicrotasks()
    const sentBefore = server.sent.length
    const stopped = collector.stop()
    finish()
    await Promise.all([first, stopped])
    expect(executeStoryFile).toHaveBeenCalledTimes(1)
    expect(server.sent).toHaveLength(sentBefore)
    expect(invalidated).not.toHaveBeenCalled()
    expect(published).toHaveBeenCalledTimes(1)
    expect(published.mock.calls[0][0].phase).toBe('started')
  })

  it('reports completed batches after invalidation and keeps failures observed', async () => {
    const invalidated = vi.fn()
    const executeStoryFile = vi.fn().mockRejectedValueOnce(new Error('batch failed')).mockResolvedValue(undefined)
    const collector = createStoryCollector({
      ctx: createContext([{ fileName: 'retry' }]),
      server: server as any,
      collectStories: { clearCache: vi.fn(), executeStoryFile } as any,
      invalidateModule: invalidated,
      invalidateModuleSilently: invalidated,
    })
    const phases: string[] = []
    collector.onCollection((event) => {
      phases.push(event.phase)
      if (event.phase === 'completed') expect(invalidated).toHaveBeenCalled()
    })
    await expect(collector.collect()).rejects.toThrow('batch failed')
    await collector.collect()
    expect(phases).toEqual(['started', 'failed', 'started', 'completed'])
    await collector.stop()
  })

  it('awaits completed publication before executing the next changed batch', async () => {
    const file = { fileName: 'a', path: '/project/a.js', relativePath: 'a.js', virtual: true, moduleCode: '', story: { id: 'a' } }
    const ctx = createContext([file])
    let release: () => void
    let entered: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const waiting = new Promise<void>((resolve) => {
      entered = resolve
    })
    const execute = vi.fn(async () => ({ status: 'collected' as const }))
    const collector = createStoryCollector({ ctx, server: server as any, collectStories: { clearCache: vi.fn(), executeStoryFile: execute }, invalidateModule: () => {}, invalidateModuleSilently: () => {} })
    await collector.collect()
    let completed = 0
    collector.onCollection(async (event) => {
      if (event.phase !== 'completed') return
      completed++
      expect(event.outcomes.get(file.path).status).toBe('collected')
      if (completed === 1) {
        entered()
        await gate
      }
    })
    notifyStoryChange(file as any)
    await waiting
    notifyStoryChange(file as any)
    expect(execute).toHaveBeenCalledTimes(2)
    release()
    await collector.collect()
    expect(execute).toHaveBeenCalledTimes(3)
    expect(completed).toBe(2)
    await collector.stop()
  })

  it('publishes unlinked membership after invalidation and never executes removed files', async () => {
    const file = { fileName: 'a', path: '/project/a.js', relativePath: 'a.js', story: { id: 'a' } }
    const ctx = createContext([file])
    const execute = vi.fn(async () => ({ status: 'collected' as const }))
    const invalidated: string[] = []
    const collector = createStoryCollector({ ctx, server: server as any, collectStories: { clearCache: vi.fn(), executeStoryFile: execute }, invalidateModule: id => invalidated.push(id), invalidateModuleSilently: id => invalidated.push(id) })
    await collector.collect()
    const events: any[] = []
    collector.onCollection((event) => {
      if (event.phase === 'completed') events.push(event)
    })
    ctx.storyFiles.length = 0
    notifyStoryListChange()
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0].files).toEqual([])
    expect(events[0].outcomes.size).toBe(0)
    expect(invalidated).toContain(VirtualFiles.RESOLVED_PREVIEW_RUNTIME_ID)
    expect(execute).toHaveBeenCalledTimes(1)
    await collector.stop()
  })
})
