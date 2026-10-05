import { cp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEmbedBuiltOutput } from '../utils/embed/built-output.js'
import { createEmbedVueProject } from '../utils/embed/vue-project.js'

// Real collection owns emitted worker.js; consumers exercise the built entry.
const { createHistoireProject } = await import('../../../../dist/node/api/index.js')
const { getProjectServices } = await import('../../../../dist/node/api/internal.js')

describe('node project SDK', () => {
  it('constructs idle from an explicit unrelated root without process or listener side effects', async () => {
    const fixture = await createEmbedVueProject('Managed')
    const cwd = process.cwd()
    const environment = { ...process.env }
    const interrupt = process.listeners('SIGINT')
    const terminate = process.listeners('SIGTERM')
    const project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
    try {
      expect(project.getSnapshot()).toMatchObject({ status: 'idle', dev: null, preview: null })
      expect(getProjectServices(project).dev).toBeUndefined()
      expect(process.cwd()).toBe(cwd)
      expect(process.env).toEqual(environment)
      expect(process.listeners('SIGINT')).toEqual(interrupt)
      expect(process.listeners('SIGTERM')).toEqual(terminate)
      await expect(project.runTests({ variantId: 'main' })).rejects.toThrow('variantId requires storyId')
    }
    finally {
      await project.close()
      await fixture.close()
    }
  })

  it('listens on an actual ephemeral address and waits for completed initial metadata', async () => {
    const fixture = await createEmbedVueProject('Managed')
    await fixture.setTitle('Managed')
    const staticOutput = await createEmbedBuiltOutput()
    await cp(staticOutput.outputRoot, join(fixture.root, 'preview-output'), { recursive: true })
    await staticOutput.fixture.close()
    await writeFile(join(fixture.root, 'histoire.config.ts'), `export { default } from './custom.ts'`)
    await writeFile(join(fixture.root, 'custom.ts'), (await readFile(join(fixture.root, 'custom.ts'), 'utf8')).replace('export default {', `export default { outDir:'preview-output',mcp:false,`))
    const project = await createHistoireProject({ root: fixture.root })
    const interrupt = process.listeners('SIGINT')
    const terminate = process.listeners('SIGTERM')
    try {
      // JavaScript option bags cannot replace project-owned root or cleanup.
      const handle = await project.startDev({
        host: '127.0.0.1',
        port: 0,
        open: false,
        root: join(fixture.root, 'absent'),
        onClose: () => { throw new Error('unowned cleanup') },
      } as any)
      await expect(project.startDev({ port: 0 })).rejects.toMatchObject({ code: 'RUNTIME_IN_USE' })
      await handle.ready
      expect(new URL(handle.url).port).not.toBe('0')
      expect(project.getSnapshot().dev?.catalog?.stories.some(story => story.id === 'overlap')).toBe(true)
      expect((await fetch(handle.url)).status).toBe(200)
      const old = getProjectServices(project).dev?.controller.current
      expect(typeof old.server.config.server.hmr).toBe('object')
      expect(old.server.config.server.hmr.server.listening).toBe(true)
      const preview = await project.preview({ port: 0, host: '127.0.0.1' })
      await preview.ready
      expect((await fetch(preview.url)).status).toBe(200)
      await handle.restart()
      expect(old?.isActive()).toBe(false)
      expect(project.getSnapshot().dev?.epoch).not.toBe(old?.epoch)
      await handle.close()
      expect((await fetch(preview.url)).status).toBe(200)
      expect(getProjectServices(project).execution.available).toBe(true)
      const second = await project.startDev({ host: '127.0.0.1', port: 0, open: false })
      await second.ready
      await second.close()
      await preview.close()
      expect(process.listeners('SIGINT')).toEqual(interrupt)
      expect(process.listeners('SIGTERM')).toEqual(terminate)
    }
    finally {
      await project.close()
      await fixture.close()
    }
  }, 60_000)

  it('completes ordinary static build and closes captured collection server exactly once', async () => {
    const fixture = await createEmbedVueProject('Successful build')
    await fixture.setTitle('Successful build')
    const project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
    const interrupt = process.listeners('SIGINT')
    const terminate = process.listeners('SIGTERM')
    try {
      const output = await project.build({ outDir: 'successful-output' })
      expect(output).toEqual({ outDir: join(fixture.root, 'successful-output'), target: 'static' })
      const data = JSON.parse(await readFile(join(output.outDir, 'histoire.json'), 'utf8'))
      expect(data.stories).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'overlap' })]))
      expect(data.capture.buildId).toBeTruthy()
      await project.close()
      expect(process.listeners('SIGINT')).toEqual(interrupt)
      expect(process.listeners('SIGTERM')).toEqual(terminate)
    }
    finally {
      await project.close()
      await fixture.close()
    }
  }, 60_000)

  it('unwinds real build acquisition failure without process signal handlers', async () => {
    const fixture = await createEmbedVueProject('Build failure')
    await fixture.setTitle('Build failure')
    const path = join(fixture.root, 'custom.ts')
    await writeFile(path, (await readFile(path, 'utf8')).replace('plugins:[HstVue(),', `plugins:[HstVue(),{name:'injected-build-failure',onBuild(){throw new Error('injected build failure')}},`))
    const project = await createHistoireProject({ root: fixture.root, configFile: 'custom.ts' })
    const interrupt = process.listeners('SIGINT')
    const terminate = process.listeners('SIGTERM')
    try {
      await expect(project.build({ outDir: 'owned-output' })).rejects.toThrow('injected build failure')
      expect(process.listeners('SIGINT')).toEqual(interrupt)
      expect(process.listeners('SIGTERM')).toEqual(terminate)
    }
    finally {
      await project.close()
      await fixture.close()
    }
  }, 30_000)
})
