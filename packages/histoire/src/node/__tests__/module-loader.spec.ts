import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'vite'
import { expect, it } from 'vitest'
import { useModuleLoader } from '../load.js'
import { createMcpProjectFixture } from './utils/mcp/project.js'

it('reloads aliased TypeScript dependencies after the module cache is cleared', async () => {
  const fixture = await createMcpProjectFixture()
  let server: Awaited<ReturnType<typeof createServer>> | undefined
  try {
    const entry = join(fixture.root, 'config.ts')
    const dependency = join(fixture.root, 'value.ts')
    await writeFile(entry, `import value from 'project:value'; export default { title: value }`)
    await writeFile(dependency, `export default 'Original title'`)
    server = await createServer({
      root: fixture.root,
      configFile: false,
      resolve: { alias: { 'project:value': dependency } },
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, hmr: false, watch: null },
    })
    const loader = useModuleLoader({ server, throws: true })
    expect((await loader.loadModule(entry)).default).toEqual({ title: 'Original title' })
    expect(loader.getDependencies(entry)).toEqual(expect.arrayContaining([entry, dependency]))

    await writeFile(dependency, `export default 'Updated title'`)
    loader.clearCache()
    expect((await loader.loadModule(entry)).default).toEqual({ title: 'Updated title' })
  }
  finally {
    try {
      await server?.close()
    }
    finally { await fixture.close() }
  }
})
