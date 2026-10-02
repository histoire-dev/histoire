import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { onStoryChange, watchStories } from '../../stories.js'

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
    const off = onStoryChange(changed)
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

  it('rejects concurrent watchers and permits next project only after close', async () => {
    const first = await watchStories(await project())
    cleanups.push(() => first.close())
    await first.ready
    const secondContext = await project()
    await expect(watchStories(secondContext)).rejects.toThrow('already owns')
    await first.close()
    const second = await watchStories(secondContext)
    cleanups.push(() => second.close())
    await second.ready
    expect(secondContext.storyFiles).toHaveLength(1)
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
