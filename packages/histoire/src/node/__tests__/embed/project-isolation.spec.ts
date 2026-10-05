import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createEmbedVueProject } from '../utils/embed/vue-project.js'

// Real collectors use emitted worker.js; build dependencies and histoire first.
const { createProjectRuntimeController } = await import('../../../../dist/node/runtime/controller.js')

describe('real project runtime isolation', () => {
  it('collects overlapping Vue IDs, edits and closes roots independently without cwd mutation', async () => {
    const first = await createEmbedVueProject('First')
    const second = await createEmbedVueProject('Second')
    const cwd = process.cwd()
    const controllers = [first, second].map(project => createProjectRuntimeController({ root: project.root, config: 'custom.ts', port: 0, open: false, host: '127.0.0.1' }))
    try {
      await Promise.all([first.setTitle('First'), second.setTitle('Second')])
      const [one, two] = await Promise.all(controllers.map(controller => controller.start()))
      expect(process.cwd()).toBe(cwd)
      expect(one.context.root).toBe(first.root)
      expect(two.context.root).toBe(second.root)
      expect(one.context.config.theme.title).toBe('First')
      expect(two.context.config.theme.title).toBe('Second')
      expect(one.context.storyFiles.find(file => file.story?.id === 'overlap')?.story.title).toBe('First')
      expect(two.context.storyFiles.find(file => file.story?.id === 'overlap')?.story.title).toBe('Second')
      expect(one.context.markdownFiles[0].html).toContain('First documentation')
      expect(two.context.markdownFiles[0].html).toContain('Second documentation')
      const outputOne = one.context.storyFiles.find(file => file.story?.id === 'generated')
      const outputTwo = two.context.storyFiles.find(file => file.story?.id === 'generated')
      expect(outputOne.path).not.toBe(outputTwo.path)
      const changed = vi.fn()
      one.server.watcher.on('change', changed)
      await first.setTitle('Updated')
      await vi.waitFor(() => expect(changed.mock.calls.some(args => args[0] === join(first.root, 'Book.story.vue'))).toBe(true), { timeout: 5000 })
      await vi.waitFor(() => expect(one.context.storyFiles.find(file => file.story?.id === 'overlap')?.story.title).toBe('Updated'), { timeout: 15_000 })
      expect(two.context.storyFiles.find(file => file.story?.id === 'overlap')?.story.title).toBe('Second')
      await controllers[0].close()
      expect(one.isActive()).toBe(false)
      expect(two.isActive()).toBe(true)
      expect(await readFile(outputTwo.path, 'utf8')).toContain('Second')
      await second.setTitle('Independent update')
      await vi.waitFor(() => expect(two.context.storyFiles.find(file => file.story?.id === 'overlap')?.story.title).toBe('Independent update'), { timeout: 15_000 })
      expect(process.cwd()).toBe(cwd)
    }
    finally {
      await Promise.all(controllers.map(controller => controller.close()))
      await Promise.all([first.close(), second.close()])
    }
  }, 60_000)
})
