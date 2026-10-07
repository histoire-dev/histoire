import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createMcpFrameworkProject } from '../../utils/mcp/framework-project.js'

// Exercise built framework integration and collection workers, like CLI users.
const { createProjectRuntimeController } = await import('../../../../../dist/node/runtime/controller.js')

describe('nuxt startup watcher acceptance', () => {
  it('starts Nuxt and recollects an edited story after optimizer folders are excluded', async () => {
    const project = await createMcpFrameworkProject('nuxt4')
    const config = join(project.root, 'histoire.config.ts')
    await writeFile(config, (await readFile(config, 'utf8')).replace('defineConfig({', 'defineConfig({ collectMaxThreads: 1, storyMatch: ["app/components/Startup.story.vue"],'))
    const file = join(project.root, 'app/components/Startup.story.vue')
    const story = '<template><Story id="startup" title="Nuxt before"><Variant id="one">Nuxt story</Variant></Story></template>'
    await writeFile(file, story)
    const controller = createProjectRuntimeController({ root: project.root, port: 0, host: '127.0.0.1', open: false })
    try {
      const runtime = await controller.start()
      expect(runtime.context.storyFiles[0].story.title).toBe('Nuxt before')
      await writeFile(file, story.replace('Nuxt before', 'Nuxt after'))
      await vi.waitFor(() => expect(runtime.context.storyFiles[0].story.title).toBe('Nuxt after'), { timeout: 30_000 })
      expect(runtime.isActive()).toBe(true)
    }
    finally {
      await controller.close()
      await project.close()
    }
  }, 120_000)
})
