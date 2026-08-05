import type { Context } from '../context.js'
import { STORY_CHANGED_EVENT } from '@histoire/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createStoryCollector } from '../server/collect.js'
import { createModuleInvalidators } from '../server/invalidate.js'
import { notifyStoryChange } from '../stories.js'
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
})
