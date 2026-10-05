import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HstSvelte } from '../../../../../histoire-plugin-svelte/src/index.node.js'
import { listComponentFiles as listSvelte } from '../../../../../histoire-plugin-svelte/src/util/list-components.js'
import { listComponentFiles as listVue } from '../../../../../histoire-plugin-vue/src/util/list-components.js'
import { closeContext } from '../../context.js'
import { getContextRegistry } from '../../runtime/registry.js'
import { linkEmbedFixtureDependencies } from '../utils/embed/project.js'
import { createMcpContext, createMcpProjectFixture } from '../utils/mcp/project.js'

describe('framework project roots', () => {
  it.each(['svelte4', 'sveltekit'])('resolves %s client aliases from supplied root', async (example) => {
    const fixture = await createMcpProjectFixture()
    const ctx = createMcpContext(fixture.root)
    try {
      await linkEmbedFixtureDependencies(fixture.root, example)
      const require = createRequire(join(fixture.root, 'package.json'))
      const packageDir = dirname(require.resolve('svelte/package.json'))
      const config = await HstSvelte().defaultConfig({} as any, 'dev', getContextRegistry(ctx).pluginContext) as any
      const vite = await config.vite({}, { mode: 'dev', command: 'serve' })
      const alias = vite.resolve.alias.find(entry => entry.find.test('svelte'))
      expect(alias.replacement.startsWith(`${packageDir}/src/`)).toBe(true)
      expect(alias.replacement).toMatch(/(?:index-client|runtime\/index)\.js$/)
    }
    finally {
      await closeContext(ctx)
      await fixture.close()
    }
  })

  it('lists only components under explicit root beside unrelated cwd', async () => {
    const fixture = await createMcpProjectFixture()
    try {
      await writeFile(join(fixture.root, 'Owned.vue'), '<template />')
      await writeFile(join(fixture.root, 'Owned.svelte'), '<button />')
      expect(await listVue('', [], 10, fixture.root)).toEqual(['Owned.vue'])
      expect(await listSvelte('', [], 10, fixture.root)).toEqual(['Owned.svelte'])
    }
    finally { await fixture.close() }
  })
})
