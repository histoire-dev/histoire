import { access, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMcpFrameworkProject } from '../utils/mcp/framework-project.js'

// Framework plugins and collecting workers must be built before this gate.
const { createProjectRuntimeController } = await import('../../../../dist/node/runtime/controller.js')
const { createContext } = await import('../../../../dist/node/context.js')

describe('nuxt resolved project root', () => {
  it('starts the real Nuxt 4 example from unrelated cwd and retains single-project ownership', async () => {
    const project = await createMcpFrameworkProject('nuxt4')
    const configFile = join(project.root, 'histoire.config.ts')
    await writeFile(configFile, (await readFile(configFile, 'utf8')).replace('defineConfig({', 'defineConfig({ collectMaxThreads: 1,'))
    const cwd = process.cwd()
    const controller = createProjectRuntimeController({ root: project.root, port: 0, host: '127.0.0.1', open: false })
    try {
      const runtime = await controller.start()
      expect(runtime.context.root).toBe(project.root)
      expect(runtime.context.storyFiles.some(file => file.story?.variants.length)).toBe(true)
      expect(runtime.context.config.setupCode.join('\n')).toContain('configFromNuxt')
      await access(join(project.root, '.nuxt', 'imports.d.ts'))
      await expect(createContext({ root: project.root, mode: 'dev' })).rejects.toThrow('Nuxt integration supports one active project per process')
      expect(runtime.isActive()).toBe(true)
      expect(process.cwd()).toBe(cwd)
    }
    finally {
      await controller.close()
      await project.close()
    }
  }, 90_000)
})
