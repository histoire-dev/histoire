import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { createContext } from '../../context.js'
import { getContextRegistry } from '../../runtime/registry.js'
import { getViteConfigWithPlugins } from '../../vite/index.js'
import { closeDevPreviewHost } from '../../vite/mcp-preview-html.js'
import { createMarkdownProject } from '../utils/markdown-project.js'

describe('vite generated directory discovery', () => {
  it('skips optimizer caches from other runs while watching active generated story sources', async () => {
    const project = await createMarkdownProject()
    const ctx = await createContext({ root: project.ctx.root, mode: 'dev' })
    try {
      const cache = join(ctx.root, '.histoire/tmp/dev/old-run/vite/deps')
      const generated = join(getContextRegistry(ctx).tempDir, 'plugins', 'vite')
      await mkdir(cache, { recursive: true })
      await mkdir(generated, { recursive: true })
      await project.write('export default {}', '.histoire/tmp/dev/old-run/vite/deps/cache.js')
      const generatedPath = join(generated, 'Generated.story.js')
      await writeFile(generatedPath, 'export default {}')
      const { viteConfig } = await getViteConfigWithPlugins(false, ctx)
      let scanned: Promise<void>
      viteConfig.plugins.push({
        name: 'owned-watcher-acceptance',
        enforce: 'post',
        config: () => ({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true } }),
        configResolved(config) {
          config.optimizeDeps.include = []
          config.server.hmr = false
          config.server.ws = false
        },
        configureServer(server) {
          scanned = new Promise<void>(resolve => server.watcher.once('ready', resolve))
        },
      })
      const server = await createServer(viteConfig)
      getContextRegistry(ctx).cleanup.add(async () => {
        closeDevPreviewHost(server)
        await server.close()
      })
      await scanned
      await vi.waitFor(() => expect(Object.keys(server.watcher.getWatched())).toContain(generated))
      const directories = Object.keys(server.watcher.getWatched())
      expect(directories).not.toContain(cache)
      expect(directories).toContain(generated)
      const changed: string[] = []
      server.watcher.on('change', file => changed.push(file))
      await writeFile(generatedPath, 'export default { title: "Edited" }')
      await vi.waitFor(() => expect(changed).toContain(generatedPath))
    }
    finally {
      await getContextRegistry(ctx).cleanup.close()
      await project.close()
    }
  })
})
