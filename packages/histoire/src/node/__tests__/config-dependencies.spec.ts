import type { RuntimeGeneration } from '../runtime/types.js'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getConfigDependencies } from '../config/dependencies.js'
import { resolveConfig } from '../config/load.js'
import { watchProjectConfiguration } from '../runtime/config-watchers.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

/**
 * Project whose Histoire config imports a local plugin module (which imports another one) and an
 * installed TypeScript package, and whose Vite config imports a local helper.
 */
async function pluginProject() {
  const { root } = await configTestProject(`import { arrange } from './plugin/index'\nimport { installed } from 'installed-plugin'\nexport default { ui: { defaultArrange: arrange }, installed }\n`)
  const files = {
    plugin: join(root, 'plugin/index.ts'),
    options: join(root, 'plugin/options.ts'),
    installed: join(root, 'node_modules/installed-plugin/index.ts'),
    viteHelper: join(root, 'vite-helper.ts'),
  }
  await mkdir(join(root, 'plugin'))
  await mkdir(join(root, 'node_modules/installed-plugin'), { recursive: true })
  await writeFile(files.plugin, `export { arrange } from './options'\n`)
  await writeFile(files.options, `export const arrange = 'grid'\n`)
  await writeFile(join(root, 'node_modules/installed-plugin/package.json'), JSON.stringify({ name: 'installed-plugin', main: 'index.ts' }))
  await writeFile(files.installed, `export const installed = true\n`)
  await writeFile(files.viteHelper, `export const base = '/'\n`)
  await writeFile(join(root, 'vite.config.ts'), `import { base } from './vite-helper'\nexport default { base }\n`)
  return { root, files }
}

/**
 * Watches a generation acquired with the real config loader.
 * @param root Project root.
 * @param config Loaded config.
 * @param restart Restart spy.
 */
function watch(root: string, config: Awaited<ReturnType<typeof resolveConfig>>, restart: (source: string, file: string) => void) {
  return watchProjectConfiguration({ context: { root, config } } as unknown as RuntimeGeneration, {}, restart)
}

describe('config module dependencies', () => {
  it('lists local modules the Histoire and Vite configs imported, never installed packages', async () => {
    const { root, files } = await pluginProject()
    const config = await resolveConfig(root, 'dev')
    expect(config.ui.defaultArrange).toBe('grid')
    const dependencies = getConfigDependencies(config)!
    expect([...dependencies.histoire.keys()]).toEqual(expect.arrayContaining([files.plugin, files.options]))
    expect([...dependencies.histoire.keys()]).not.toContain(files.installed)
    expect([...dependencies.vite.keys()]).toContain(files.viteHelper)
  })

  it('restarts like a config edit when an imported local module changes', async () => {
    const { root, files } = await pluginProject()
    const restart = vi.fn()
    const cleanup = await watch(root, await resolveConfig(root, 'dev'), restart)
    try {
      await writeFile(files.options, `export const arrange = 'list'\n`)
      await vi.waitFor(() => expect(restart).toHaveBeenCalledWith('Histoire', files.options))
      await writeFile(files.viteHelper, `export const base = '/book/'\n`)
      await vi.waitFor(() => expect(restart).toHaveBeenCalledWith('Vite', files.viteHelper))
      expect(restart).toHaveBeenCalledTimes(2)
    }
    finally { await cleanup() }
  })

  it('restarts for a module edited after loading but before the watcher was ready', async () => {
    const { root, files } = await pluginProject()
    const config = await resolveConfig(root, 'dev')
    await writeFile(files.plugin, `export const arrange = 'list'\n`)
    const restart = vi.fn()
    const cleanup = await watch(root, config, restart)
    try {
      expect(restart).toHaveBeenCalledExactlyOnceWith('Histoire', files.plugin)
    }
    finally { await cleanup() }
  })
})
