import type { ProjectRuntimeHandle } from '../../runtime/types.js'
import type { CollectionEvent } from '../../server/collect.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { attachProjectCatalog } from '../../mcp/project/runtime-catalog.js'
import { attachRuntimeCatalog, getRuntimeCatalogForContext } from '../../runtime/catalog/attachment.js'
import { deferred } from '../utils/mcp/deferred.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory, MCP_PROJECT_OPTIONS } from '../utils/mcp/project.js'

describe('canonical generation attachment', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it('joins initial completion and shares one observer/provider with MCP adapter', async () => {
    const file = createMcpStory(fixture.root)
    const context = createMcpContext(fixture.root, [file])
    const collection = deferred<void>()
    const observers = new Set<(event: CollectionEvent) => void | Promise<void>>()
    const runtime: ProjectRuntimeHandle = {
      context,
      epoch: MCP_PROJECT_OPTIONS.epoch,
      ready: collection.promise,
      server: {} as any,
      isActive: () => true,
      close: async () => {},
      collect: async () => {},
      collectionOutcomes: new Map([[file.path, { status: 'collected' }]]),
      onCollection(observer) {
        observers.add(observer)
        return () => {
          observers.delete(observer)
        }
      },
    }
    const canonical = attachRuntimeCatalog(runtime, MCP_PROJECT_OPTIONS)
    const mcp = attachProjectCatalog(runtime, MCP_PROJECT_OPTIONS)
    expect(observers.size).toBe(1)
    expect(getRuntimeCatalogForContext(context)).toBe(canonical)
    expect(canonical.catalog.current).toBeUndefined()
    collection.resolve()
    await Promise.all([canonical.ready, mcp.ready])
    expect(mcp.catalog.current.revision).toBe(canonical.catalog.current.revision)
    for (const observer of observers) await observer({ phase: 'started', files: [file], outcomes: runtime.collectionOutcomes })
    expect(mcp.catalog.updating).toBe(true)
    for (const observer of observers) await observer({ phase: 'failed', files: [file], outcomes: runtime.collectionOutcomes, error: 'broken' })
    expect(canonical.catalog.current.outcome).toBe('failed')
    expect(mcp.catalog.current.failed).toBe(true)
    canonical.close()
    expect(observers.size).toBe(0)
    expect(getRuntimeCatalogForContext(context)).toBeUndefined()
  })
})
