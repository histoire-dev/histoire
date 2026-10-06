import { readFile, rm } from 'node:fs/promises'
import chokidar from 'chokidar'
import { createServer } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { tailwindTokens } from '../../builtin-plugins/tailwind-tokens.js'
import { useModuleLoader } from '../../load.js'
import { createTailwindFixture } from '../utils/tailwind.js'

describe('tailwind generation lifecycle', () => {
  it('recovers initial compatibility-plugin failure when only its nested import is repaired', async () => {
    const fixture = await createTailwindFixture(4)
    const cleanups: (() => unknown)[] = []
    let server: Awaited<ReturnType<typeof createServer>> | undefined
    const logging = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const nested = await fixture.write('plugin-color.ts', 'export default #broken')
      const pluginFile = await fixture.write('plugin.ts', `import color from './plugin-color'; export default ({addUtilities})=>addUtilities({'.bg-plugin':{backgroundColor:color}})`)
      await fixture.write('main.css', '@import "tailwindcss"; @plugin "./plugin.ts";')
      server = await createServer({ root: fixture.root, configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, optimizeDeps: { noDiscovery: true } })
      fixture.api.moduleLoader = useModuleLoader({ server, throws: true })
      await tailwindTokens().onDev!(Object.assign(fixture.api, { watcher: chokidar }), cb => cleanups.push(cb))
      expect(fixture.api.error).toHaveBeenCalled()
      expect(fixture.ctx.storyFiles).toHaveLength(0)
      expect(fixture.api.moduleLoader.getDependencies!(pluginFile)).toContain(nested)
      await fixture.write('plugin-color.ts', `export default '#456789'`)
      await vi.waitFor(() => expect(fixture.ctx.storyFiles).toHaveLength(1), { timeout: 5000 })
      expect(await readFile(fixture.ctx.storyFiles[0].path, 'utf8')).toContain('#456789')
    }
    finally {
      for (const close of cleanups.reverse()) await close()
      await server?.close()
      await fixture.close()
      logging.mockRestore()
    }
  })

  it('awaits initial dev generation, updates dependencies, recovers and removes entries', async () => {
    const fixture = await createTailwindFixture(4)
    const cleanups: (() => unknown)[] = []
    try {
      await fixture.write('colors.css', '@theme { --color-brand: #123456; }')
      const entry = await fixture.write('main.css', '@import "tailwindcss"; @import "./colors.css";')
      const plugin = tailwindTokens()
      await plugin.onDev!(Object.assign(fixture.api, { watcher: chokidar }), cb => cleanups.push(cb))
      expect(fixture.ctx.storyFiles).toHaveLength(1)
      const storyPath = fixture.ctx.storyFiles[0].path
      await fixture.write('colors.css', '@theme { --color-brand: #abcdef; }')
      await vi.waitFor(async () => expect(await readFile(storyPath, 'utf8')).toContain('#abcdef'), { timeout: 8000 })
      await fixture.write('colors.css', '@theme { broken')
      await vi.waitFor(() => expect(fixture.api.error).toHaveBeenCalled(), { timeout: 8000 })
      expect(await readFile(storyPath, 'utf8')).toContain('#abcdef')
      await fixture.write('colors.css', '@theme { --color-brand: #fedcba; }')
      await vi.waitFor(async () => expect(await readFile(storyPath, 'utf8')).toContain('#fedcba'), { timeout: 8000 })
      await rm(entry)
      await vi.waitFor(() => expect(fixture.ctx.storyFiles.some(file => file.path === storyPath)).toBe(false), { timeout: 8000 })
    }
    finally {
      for (const close of cleanups.reverse()) await close()
      await fixture.close()
    }
  }, 30000)

  it('fails production generation for broken detected source', async () => {
    const fixture = await createTailwindFixture(4)
    try {
      await fixture.write('main.css', '@import "tailwindcss"; @import "./missing.css";')
      await expect(tailwindTokens().onBuild!(fixture.api)).rejects.toThrow('missing.css')
      expect(fixture.ctx.storyFiles).toHaveLength(0)
    }
    finally { await fixture.close() }
  })

  it('disables discovery explicitly', async () => {
    const fixture = await createTailwindFixture(4)
    try {
      await fixture.write('main.css', '@import "tailwindcss";')
      await tailwindTokens({ enabled: false }).onBuild!(fixture.api)
      expect(fixture.ctx.storyFiles).toHaveLength(0)
    }
    finally { await fixture.close() }
  })
})
