import type { TerminalBridge, TerminalBridgeEvent } from '../../../../../histoire-cli/src/terminal/bridge.js'
import type { TerminalHandlerContext } from '../../runtime/terminal/registry.js'
import type { CollectionEvent } from '../../server/collect.js'
import { TerminalError } from '@histoire/cli/protocol/core'
import { readyGeneration } from '../../../../../histoire-cli/src/__tests__/utils/terminal/progress.js'
import { createProgressState } from '../../../../../histoire-cli/src/terminal/progress/state.js'
import { createRuntimeCatalog } from '../../runtime/catalog/publication.js'
import { catalogHandlers } from '../../runtime/terminal/handlers/catalog.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory, MCP_PROJECT_OPTIONS } from '../utils/mcp/project.js'

/** One fake story: ID, display title and variant IDs. */
export interface StoryDefinition {
  id: string
  title?: string
  variants?: (string | { id: string, title: string })[]
}

/**
 * Real runtime catalog (hashing and publication), real handlers and service, and an
 * in-memory transport: only the child-to-parent IPC hop and the Vite handle are replaced.
 * The progress mirror is the real parent state machine.
 * @param options Router mode and base of the fake workbench.
 * @param options.routerMode Router mode of the fake workbench.
 * @param options.base Deployment base of the fake workbench.
 */
export async function createCatalogHarness(options: { routerMode?: 'hash' | 'history', base?: string } = {}) {
  const fixture = await createMcpProjectFixture()
  const catalog = createRuntimeCatalog({ ...MCP_PROJECT_OPTIONS, root: fixture.root })
  const progress = createProgressState()
  const listeners = new Set<(event: TerminalBridgeEvent) => void>()
  const collectors = new Set<(event: CollectionEvent) => void | Promise<void>>()
  const abort = new AbortController()
  let active = true
  let generation = 'g1'
  let files: ReturnType<typeof createMcpStory>[] = []
  /** Gates that delay a reply after it was computed, oldest first. */
  const holds: ReturnType<typeof deferred>[] = []
  const calls: { operation: string, args: unknown }[] = []

  const handle = {
    context: { config: { routerMode: options.routerMode ?? 'history' } },
    server: { config: { base: options.base ?? '/' } },
    isActive: () => active,
    onCollection: (handler: (event: CollectionEvent) => void | Promise<void>) => {
      collectors.add(handler)
      return () => void collectors.delete(handler)
    },
  }
  const context = { generation, handle, catalog, emit: (event: string, data: unknown) => listeners.forEach(listener => listener({ generation, event, data } as TerminalBridgeEvent)), signal: abort.signal, execution: undefined } as unknown as TerminalHandlerContext

  const bridge = {
    pending: 0,
    subscribe(listener: (event: TerminalBridgeEvent) => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    receive() {},
    retire() {},
    close() {},
    async send(operation: string, args: unknown) {
      calls.push({ operation, args })
      const sentIn = generation
      const handler = catalogHandlers.find(entry => entry.operation === operation)
      if (!handler) throw new TerminalError('unsupported', operation)
      // The answer is computed now (from the catalog as it is now) and delivered later when held.
      let result: unknown
      let failure: unknown
      try {
        result = await handler.handle(args, context)
      }
      catch (error) {
        failure = error
      }
      const hold = holds.shift()
      if (hold) await hold.promise
      if (sentIn !== generation) throw new TerminalError('retired', 'Runtime generation retired')
      if (failure) throw failure
      return result
    },
  } as unknown as TerminalBridge

  /** Publishes a complete catalog; the attachment's `started`/`completed` sequence is simulated around it. */
  async function publish(stories: StoryDefinition[]) {
    files = stories.map((story) => {
      const file = createMcpStory(fixture.root, story.id, `${story.id.replace(/\W/g, '_')}.story.js`, (story.variants ?? ['main']).map(variant => typeof variant === 'string' ? { id: variant, title: variant } : variant))
      file.story!.title = story.title ?? story.id
      file.moduleCode = `export default { id: ${JSON.stringify(story.id)}, variants: ${JSON.stringify(story.variants ?? [])} }`
      return file
    })
    catalog.markUpdating()
    for (const collector of collectors) await collector({ phase: 'started' } as CollectionEvent)
    await catalog.publish(createMcpContext(fixture.root, files))
    for (const collector of collectors) await collector({ phase: 'completed' } as CollectionEvent)
  }

  return {
    catalog,
    bridge,
    progress,
    calls,
    handle,
    /** Delays the reply of the next send until the returned function is called. */
    holdNext() {
      const gate = deferred()
      holds.push(gate)
      return gate.resolve
    },
    publish,
    /** Makes the runtime of generation `next` ready (parent progress mirror and child). */
    ready(next = 'g1') {
      generation = next
      readyGeneration(progress, next)
    },
    /** The runtime goes away: replies of the old generation can no longer be delivered. */
    restarting() {
      progress.onStatus({ status: 'restarting' })
    },
    /** Frees the project directory. */
    async close() {
      active = false
      abort.abort()
      await fixture.close()
    },
  }
}

/** Harness created by {@link createCatalogHarness}. */
export type CatalogHarness = Awaited<ReturnType<typeof createCatalogHarness>>
