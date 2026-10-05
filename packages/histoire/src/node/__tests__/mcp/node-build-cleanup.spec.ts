import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasUnconfirmedCleanup } from '../../runtime/cleanup.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory } from '../utils/mcp/project.js'

const lifecycle = vi.hoisted(() => ({ close: vi.fn(), collect: vi.fn(), buildStart: vi.fn() }))
vi.mock('vite', () => ({ createServer: async () => ({ close: lifecycle.close, pluginContainer: { buildStart: lifecycle.buildStart } }), mergeConfig: (config: unknown) => config }))
vi.mock('../../load.js', () => ({ useModuleLoader: () => ({}) }))
vi.mock('../../stories.js', () => ({ findAllStories: async () => {} }))
vi.mock('../../markdown.js', () => ({ scanMarkdownFiles: async () => {} }))
vi.mock('../../vite/index.js', () => ({ getViteConfigWithPlugins: async () => ({ viteConfig: {} }) }))
vi.mock('../../build/collect.js', () => ({ collectStories: lifecycle.collect, renderPreviewStories: async () => {} }))

describe('failed build acquisition cleanup', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
    lifecycle.close.mockReset().mockResolvedValue(undefined)
    lifecycle.collect.mockReset()
    lifecycle.buildStart.mockReset()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it.each(['plugin', 'collection'])('closes acquired collection server after %s failure and retains previous output', async (failure) => {
    const { build } = await import('../../build/index.js')
    const ctx = createMcpContext(fixture.root, [createMcpStory(fixture.root)])
    ctx.config.outDir = join(fixture.root, 'dist')
    ctx.config.plugins = [{ name: 'failure', onBuild: async () => {
      if (failure === 'plugin') throw new Error('controlled plugin failure')
    } }]
    if (failure === 'collection') lifecycle.collect.mockRejectedValue(new Error('controlled collection failure'))
    await mkdir(ctx.config.outDir)
    await writeFile(join(ctx.config.outDir, 'index.html'), 'previous valid output')
    await expect(build(ctx, { target: 'node', nodeEntryFile: join(fixture.root, 'fixture.mjs') })).rejects.toThrow(`controlled ${failure} failure`)
    expect(lifecycle.close).toHaveBeenCalledOnce()
    expect(await readFile(join(ctx.config.outDir, 'index.html'), 'utf8')).toBe('previous valid output')
    expect(await readdir(fixture.root)).toEqual(['dist'])
  })

  it('preserves build failure and quarantines unconfirmed server teardown while discarding staging', async () => {
    const { build } = await import('../../build/index.js')
    const ctx = createMcpContext(fixture.root, [createMcpStory(fixture.root)])
    ctx.config.outDir = join(fixture.root, 'dist')
    ctx.config.plugins = [{ name: 'failure', onBuild: async () => {
      throw new Error('controlled build failure')
    } }]
    lifecycle.close.mockRejectedValueOnce(new Error('controlled close failure'))
    const failure = await build(ctx, { target: 'node', nodeEntryFile: join(fixture.root, 'fixture.mjs') }).catch(error => error)
    expect(failure).toBeInstanceOf(AggregateError)
    expect(failure.errors[0].message).toBe('controlled build failure')
    expect(hasUnconfirmedCleanup(failure)).toBe(true)
    expect(lifecycle.close).toHaveBeenCalledOnce()
    expect(await readdir(fixture.root)).toEqual([])
  })
})
