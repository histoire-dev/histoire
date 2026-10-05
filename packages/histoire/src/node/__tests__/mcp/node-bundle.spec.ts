import { readFile, writeFile } from 'node:fs/promises'
import { builtinModules } from 'node:module'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bundleNodeRuntime } from '../../build/node/bundle.js'
import { createNodePackage } from '../../build/node/package.js'
import { validateNodeBundleImport } from '../../build/node/validate-bundle.js'
import { createMcpProjectFixture } from '../utils/mcp/project.js'

describe('standalone server bundle', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it('bundles real SDK/Zod for Node22 ESM and imports without installed project packages', async () => {
    const entry = join(fixture.root, 'entry.mjs')
    const zod = fileURLToPath(import.meta.resolve('zod/v4'))
    const factory = fileURLToPath(new URL('../../mcp/server/factory.ts', import.meta.url))
    const transport = fileURLToPath(new URL('../../mcp/transport/http.ts', import.meta.url))
    await writeFile(entry, `import { createHistoireMcpServer } from ${JSON.stringify(factory)}; import { z } from ${JSON.stringify(zod)}; export { createMcpHttpHandler } from ${JSON.stringify(transport)}; export const parsed = z.string().parse('portable'); export const server = createHistoireMcpServer({project:{projectId:'fixture'},principal:'fixture',version:'1'});`)
    const output = join(fixture.root, 'server.mjs')
    const result = await bundleNodeRuntime(entry, output)
    expect(result.inputs.length).toBeGreaterThan(2)
    expect(result.externalImports.every(id => builtinModules.includes(id.replace(/^node:/, '')))).toBe(true)
    const imported = await import(pathToFileURL(output).href)
    await validateNodeBundleImport(output)
    expect(imported.parsed).toBe('portable')
    expect(imported.server).toBeDefined()
    expect((await readFile(output, 'utf8'))).not.toMatch(/from ['"](?:zod|@modelcontextprotocol\/)/)
  })

  it.each(['vite', '@histoire/sdk', '@histoire/vue', '@histoire/app', 'vue'])('rejects %s imports before emitting an artifact', async (dependency) => {
    const entry = join(fixture.root, 'entry.mjs')
    await writeFile(entry, `import ${JSON.stringify(dependency)}; export {}`)
    await expect(bundleNodeRuntime(entry, join(fixture.root, 'server.mjs'))).rejects.toThrow(`Forbidden deployed runtime import: ${dependency}`)
  })

  it('allows only audited built policy and generic cleanup modules', async () => {
    const entry = join(fixture.root, 'entry.mjs')
    const policy = fileURLToPath(new URL('../../config/embed-built.ts', import.meta.url))
    const cleanup = fileURLToPath(new URL('../../runtime/cleanup.ts', import.meta.url))
    await writeFile(entry, `export {readBuiltEmbedPolicy} from ${JSON.stringify(policy)};export {hasUnconfirmedCleanup} from ${JSON.stringify(cleanup)}`)
    const output = join(fixture.root, 'server.mjs')
    await expect(bundleNodeRuntime(entry, output)).resolves.toBeDefined()
    await validateNodeBundleImport(output)
    for (const path of ['../../config/load.ts', '../../runtime/controller.ts']) {
      const forbidden = fileURLToPath(new URL(path, import.meta.url))
      await writeFile(entry, `import ${JSON.stringify(forbidden)};export {}`)
      await expect(bundleNodeRuntime(entry, output)).rejects.toThrow('Forbidden deployed runtime import:')
    }
  })

  it('rejects a relative project context import before following its dev graph', async () => {
    const context = fileURLToPath(new URL('../../context.ts', import.meta.url))
    const entry = join(fixture.root, 'entry.mjs')
    await writeFile(entry, `import ${JSON.stringify(relative(fixture.root, context))};export {}`)
    await expect(bundleNodeRuntime(entry, join(fixture.root, 'server.mjs'))).rejects.toThrow('Forbidden deployed runtime import:')
  })

  it('generates minimal ESM deployment package with optional browser peer only', () => {
    expect(createNodePackage('1.2.3')).toEqual({ private: true, type: 'module', version: '1.2.3', engines: { node: '>=22' }, scripts: { start: 'node server.mjs' } })
    expect(createNodePackage('1.2.3', '1.59.1').optionalDependencies).toEqual({ playwright: '1.59.1' })
  })
})
