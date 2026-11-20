import type { InlineConfig, ResolvedConfig, ViteDevServer } from 'vite'
import type { Context } from '../../context.js'
import type { VitestBrowserRuntimeConfigResult } from '../../vitest-browser-config/index.js'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, vi } from 'vitest'
import { createVitest } from 'vitest/node'
import { getDefaultConfig } from '../../config/index.js'
import { createVitestBrowserRuntimeConfig } from '../../vitest-browser-config/index.js'

/**
 * Minimal Histoire context of a browser run.
 * @param root Project root, defaults to the current directory.
 */
export function createBrowserRunContext(root = process.cwd()): Context {
  return {
    root,
    config: getDefaultConfig(),
    resolvedViteConfig: { root } as Context['resolvedViteConfig'],
    mode: 'dev',
    storyFiles: [],
    supportPlugins: [],
    markdownFiles: [],
    registeredCommands: [],
  }
}

/**
 * Writes project files (JSON manifests or raw sources) under a root.
 * @param root The project root.
 * @param files Contents keyed by path relative to the root.
 */
export async function writeProjectFiles(root: string, files: Record<string, unknown>) {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), typeof content === 'string' ? content : JSON.stringify(content))
  }
}

/**
 * Creates the Vitest instance of a browser run and its browser server,
 * without launching a browser, then closes it once `inspect` settled.
 * @param root Project root.
 * @param config The run's Vitest + Vite config.
 * @param inspect Called with the listening browser server.
 */
export async function withVitestBrowserServer(root: string, config: VitestBrowserRuntimeConfigResult, inspect: (server: ViteDevServer) => Promise<void> = async () => {}) {
  // Vitest 5's optimizer resolves native browser modules from the fixture root.
  const require = createRequire(import.meta.url)
  const modules = join(root, 'node_modules')
  await mkdir(join(modules, '@histoire'), { recursive: true })
  await Promise.all(['vite', 'vitest', '@histoire/shared'].map(name => symlink(dirname(require.resolve(`${name}/package.json`)), join(modules, name), 'junction')))
  const vitest = await createVitest('test', { ...config.vitestOptions, root, watch: false } as any, config.viteConfig as any)
  try {
    const server = vitest.projects[0].browser!.vite as unknown as ViteDevServer
    if (!server.resolvedUrls) await server.listen()
    await inspect(server)
    await settleDependencyOptimizer(server)
  }
  finally { await vitest.close() }
}

/**
 * Waits for the browser server's first dependency optimization: closing the
 * server cancels it, but its bundler can still read the project afterwards
 * and fail on files the test already removed.
 * @param server The browser server.
 */
async function settleDependencyOptimizer(server: ViteDevServer) {
  const optimizer = server.environments.client.depsOptimizer as { initState?: string, metadata: { discovered: Record<string, { processing?: Promise<void> }> } } | undefined
  if (!optimizer) return
  // COMPAT: Vite's internal init fills `discovered` with the `include` list
  // and the processing promise of the first run, then turns `initialized`.
  await vi.waitFor(() => expect(optimizer.initState).not.toBe('initializing'))
  await Promise.all(Object.values(optimizer.metadata.discovered).map(dep => dep.processing))
}

/**
 * Starts the Vitest instance of a browser run in a project depending on
 * `browser-only`, a package exporting its entry under the `browser` condition
 * alone: like `@tiptap/pm` (no `.` entry at all), Node resolve conditions
 * cannot load it. Returns the shared server's resolved configuration.
 * @param options Per-run overrides passed to `createVitestBrowserRuntimeConfig`.
 * @param frameworkConfig Extra base Vite config (e.g. a framework plugin's), given the project root.
 * @param inspect Called with the listening browser server.
 */
export async function startBrowserOnlyDependencyRun(
  options: Parameters<typeof createVitestBrowserRuntimeConfig>[2],
  frameworkConfig: (root: string) => InlineConfig = () => ({}),
  inspect?: (server: ViteDevServer) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'histoire-browser-optimizer-'))
  let resolved!: ResolvedConfig
  try {
    await writeProjectFiles(root, {
      'package.json': { type: 'module', dependencies: { 'browser-only': '1' } },
      'node_modules/browser-only/package.json': { name: 'browser-only', type: 'module', exports: { '.': { browser: './index.js' } } },
      'node_modules/browser-only/index.js': 'export const value = 1\n',
    })
    const { plugins = [], ...framework } = frameworkConfig(root)
    const config = await createVitestBrowserRuntimeConfig(createBrowserRunContext(root), {
      root,
      configFile: false,
      cacheDir: join(root, '.cache'),
      plugins,
      // Framework client optimizer list (e.g. Nuxt's) at the top level.
      optimizeDeps: { include: ['browser-only'] },
      ...framework,
    }, options)
    await withVitestBrowserServer(root, config, async (server) => {
      resolved = server.config
      await inspect?.(server)
    })
    return resolved
  }
  finally { await rm(root, { recursive: true, force: true }) }
}
