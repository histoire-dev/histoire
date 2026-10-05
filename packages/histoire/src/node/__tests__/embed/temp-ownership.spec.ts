import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { closeContext, createContext } from '../../context.js'
import { BasePluginApi } from '../../plugin.js'
import { createMcpProjectFixture } from '../utils/mcp/project.js'

describe('context root and generated output ownership', () => {
  it('loads relative config from explicit root and keeps legacy hooks compatible', async () => {
    const fixture = await createMcpProjectFixture()
    const cwd = process.cwd()
    try {
      await writeFile(join(fixture.root, 'custom.ts'), `export default { plugins: [{
        name:'legacy-and-context',
        defaultConfig(config, mode) { if(mode !== 'dev') throw new Error('legacy mode changed'); return { responsivePresets:[] } },
        config(config, mode, context) { return { theme:{ title:context.root } } },
        configResolved(config, context) { if(config.outDir !== context.root+'/.histoire/dist') throw new Error('configResolved ran too early') }
      }] }`)
      const ctx = await createContext({ root: fixture.root, configFile: 'custom.ts', mode: 'dev' })
      try {
        expect(ctx.root).toBe(fixture.root)
        expect(ctx.config.theme.title).toBe(fixture.root)
        expect(ctx.config.responsivePresets).toEqual([])
        expect(ctx.resolvedViteConfig.root).toBe(fixture.root)
        expect(process.cwd()).toBe(cwd)
      }
      finally { await closeContext(ctx) }
    }
    finally { await fixture.close() }
  })

  it('keeps same-root dev/build plugin outputs separate and deletes only captured output', async () => {
    const fixture = await createMcpProjectFixture()
    const contexts = []
    try {
      for (const mode of ['dev', 'build'] as const) contexts.push(await createContext({ root: fixture.root, mode }))
      const apis = contexts.map(ctx => new BasePluginApi(ctx, { name: 'test:generated' }, {} as any))
      expect(apis[0].root).toBe(fixture.root)
      expect(apis[0].pluginTempDir).not.toBe(apis[1].pluginTempDir)
      for (const [index, api] of apis.entries()) {
        await mkdir(api.pluginTempDir, { recursive: true })
        await writeFile(join(api.pluginTempDir, 'owned'), String(index))
      }
      await closeContext(contexts[0])
      await expect(access(apis[0].pluginTempDir)).rejects.toThrow()
      expect(await readFile(join(apis[1].pluginTempDir, 'owned'), 'utf8')).toBe('1')
      expect(apis[1].getContext().tempDir).toContain(fixture.root)
    }
    finally {
      await Promise.all(contexts.map(ctx => closeContext(ctx)))
      await fixture.close()
    }
  })

  it('unwinds configuration resources in reverse order when a later hook throws', async () => {
    const fixture = await createMcpProjectFixture()
    try {
      await writeFile(join(fixture.root, 'custom.ts'), `import { appendFile } from 'node:fs/promises'; export default { plugins: [{
        name:'failed-start',
        defaultConfig(config, mode, context) {
          context.onCleanup(()=>appendFile(context.root+'/closed','first\\n'));
          context.onCleanup(()=>appendFile(context.root+'/closed','second\\n'));
        },
        config() { throw new Error('config failed') }
      }] }`)
      await expect(createContext({ root: fixture.root, configFile: 'custom.ts', mode: 'dev' })).rejects.toThrow('config failed')
      expect(await readFile(join(fixture.root, 'closed'), 'utf8')).toBe('second\nfirst\n')
    }
    finally { await fixture.close() }
  })
})
