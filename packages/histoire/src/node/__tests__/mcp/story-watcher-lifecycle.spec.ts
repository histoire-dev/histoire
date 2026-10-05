import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onStoryChange, onStoryListChange, watchStories } from '../../stories.js'

describe('story watcher lifecycle', () => {
  const cleanups: (() => Promise<unknown>)[] = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  })

  /** Temporary project with one registered story and matching support plugin. */
  async function project() {
    const root = await mkdtemp(join(tmpdir(), 'histoire-story-watch-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    await writeFile(join(root, 'initial.story.vue'), '<template><Story /></template>')
    return {
      root,
      storyFiles: [],
      config: { storyMatch: ['**/*.story.vue'], storyIgnored: [], supportMatch: [{ patterns: ['**/*.vue'], pluginIds: ['vue'] }] },
    } as any
  }

  it('reports initial scan complete and cancels delayed add feedback when closed', async () => {
    const ctx = await project()
    const changed = vi.fn()
    const off = onStoryChange(ctx, changed)
    cleanups.push(async () => off())
    const watcher = await watchStories(ctx)
    cleanups.push(() => watcher.close())
    await watcher.ready
    expect(ctx.storyFiles.map((file: any) => file.relativePath)).toEqual(['initial.story.vue'])
    await watcher.close()
    await watcher.close()
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(changed).not.toHaveBeenCalled()
  })

  it('keeps different roots independently watched and rejects duplicate context watchers', async () => {
    const firstContext = await project()
    const first = await watchStories(firstContext)
    cleanups.push(() => first.close())
    await first.ready
    const secondContext = await project()
    await expect(watchStories(firstContext)).rejects.toThrow('already owns this context')
    const second = await watchStories(secondContext)
    cleanups.push(() => second.close())
    await second.ready
    expect(secondContext.storyFiles).toHaveLength(1)
    await first.close()
    expect(secondContext.storyFiles).toHaveLength(1)
  })

  it('ignores unmatched/ignored event paths and never recollects on unknown unlink', async () => {
    const ctx = await project()
    ctx.config.storyIgnored = ['**/ignored.story.vue']
    ctx.config.supportMatch[0].patterns.push('**/*.js')
    await writeFile(join(ctx.root, 'helper.js'), 'export default {}')
    await writeFile(join(ctx.root, 'ignored.story.vue'), '<template><Story /></template>')
    const changed = vi.fn()
    const off = onStoryListChange(ctx, changed)
    cleanups.push(async () => off())
    const watcher = await watchStories(ctx)
    cleanups.push(() => watcher.close())
    await watcher.ready
    // Chokidar can report paths without stats during optimizer renames. The
    // collection boundary must enforce membership independently of that scan.
    watcher.emit('add', 'helper.js')
    watcher.emit('add', 'ignored.story.vue')
    watcher.emit('unlink', 'optimizer/deps.js')
    expect(ctx.storyFiles.map((file: any) => file.relativePath)).toEqual(['initial.story.vue'])
    expect(changed).not.toHaveBeenCalled()
    await rm(join(ctx.root, 'initial.story.vue'))
    await vi.waitFor(() => expect(changed).toHaveBeenCalledOnce())
    expect(ctx.storyFiles).toHaveLength(0)
  })

  it('settles failed initial registration as readiness failure rather than escaping watcher callback', async () => {
    const ctx = await project()
    ctx.config.supportMatch = []
    const watcher = await watchStories(ctx)
    cleanups.push(() => watcher.close())
    await expect(watcher.ready).rejects.toThrow('No support plugin found')
    await watcher.close()
  })
})
