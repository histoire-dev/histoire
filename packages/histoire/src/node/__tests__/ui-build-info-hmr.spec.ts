import type { Context } from '../context.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { createServer } from 'vite'
import { expect, it, vi } from 'vitest'
import { createModuleInvalidators } from '../server/invalidate.js'
import { BUILD_INFO_ID, RESOLVED_BUILD_INFO_ID } from '../virtual/index.js'
import { createVirtualFilesPlugin } from '../virtual/vite-plugin.js'

it('addresses build-info invalidation to the browser hot context registered by actual Vite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'histoire-build-info-hmr-'))
  const virtual = createVirtualFilesPlugin({ root, mode: 'dev' } as Context, false)
  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{
      ...virtual,
      /** Metadata contents are tested separately; this fixture isolates real HMR addressing. */
      load(id) {
        if (id === RESOLVED_BUILD_INFO_ID) return 'export const buildInfo = {}; if (import.meta.hot) import.meta.hot.accept(() => {})'
      },
    }, {
      name: 'build-info-consumer',
      /** Supply a disk-independent consumer using production public virtual identity. */
      resolveId(id) { if (id === '/consumer.js') return id },
      /** Browser import analysis creates the same module graph entry as the workbench. */
      load(id) { if (id === '/consumer.js') return `import { buildInfo } from '${BUILD_INFO_ID}'; console.log(buildInfo)` },
    }],
  })
  try {
    const consumer = await server.transformRequest('/consumer.js')
    const url = consumer?.code.match(/from "([^"]+)"/)?.[1]
    expect(url).toBeDefined()
    // Vite's HTTP transform middleware unwraps /@id/ before this public transform call.
    const metadata = await server.transformRequest(RESOLVED_BUILD_INFO_ID)
    const hotContext = metadata?.code.match(/__vite__createHotContext\("([^"]+)"\)/)?.[1]
    expect(hotContext).toBeDefined()
    expect(url).toBe(hotContext)
    const send = vi.spyOn(server.ws, 'send')
    createModuleInvalidators(server).invalidateModule(RESOLVED_BUILD_INFO_ID)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ updates: [expect.objectContaining({ path: hotContext, acceptedPath: hotContext })] }))
  }
  finally {
    await server.close()
    await rm(root, { recursive: true, force: true })
  }
})
