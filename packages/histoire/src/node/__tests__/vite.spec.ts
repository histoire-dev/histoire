import type { Context } from '../context.js'
import fs from 'node:fs'
import path from 'node:path'
import { normalizePath, resolveConfig, searchForWorkspaceRoot } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultConfig } from '../config/index.js'
import { closeContext } from '../context.js'
import { onStoryChange } from '../stories.js'
import { onVisualSourceRetired } from '../visual/source.js'
import { getViteConfigWithPlugins } from '../vite/index.js'
import { closeDevPreviewHost } from '../vite/mcp-preview-html.js'

describe('getViteConfigWithPlugins', () => {
  function createContext(): Context {
    const root = process.cwd()

    return {
      root,
      config: getDefaultConfig(),
      resolvedViteConfig: {
        root,
      } as Context['resolvedViteConfig'],
      mode: 'dev',
      storyFiles: [{
        id: 'story-id',
        path: `${root}/src/components/Example.story.vue`,
        treePath: ['Example'],
        fileName: 'Example',
        moduleId: `${root}/src/components/Example.story.vue`,
        relativePath: 'src/components/Example.story.vue',
        supportPluginId: 'vue3',
      }],
      supportPlugins: [],
      markdownFiles: [],
      registeredCommands: [],
    }
  }

  it('applies plugin Vite configuration before resolution with its execution context', async () => {
    const ctx = createContext()
    const calls: unknown[] = []
    ctx.config.vite = { define: { FROM_USER: 'true' } }
    ctx.config.plugins.push({
      name: 'vite-config-test',
      viteConfig(config, context) {
        calls.push({ context, userValue: config.define?.FROM_USER })
        return context.isServer ? undefined : { define: { FROM_PLUGIN: 'true' } }
      },
    })
    try {
      const client = await getViteConfigWithPlugins(false, ctx)
      const collector = await getViteConfigWithPlugins(true, ctx)
      const browser = await getViteConfigWithPlugins(false, ctx, { browserRuntime: true, collecting: true })
      expect(client.viteConfig.define).toMatchObject({ FROM_USER: 'true', FROM_PLUGIN: 'true' })
      expect(collector.viteConfig.define).toMatchObject({ FROM_USER: 'true' })
      expect(collector.viteConfig.define?.FROM_PLUGIN).toBeUndefined()
      expect(calls).toEqual([
        { context: { mode: 'dev', isServer: false, browserRuntime: false, collecting: false }, userValue: 'true' },
        { context: { mode: 'dev', isServer: true, browserRuntime: false, collecting: false }, userValue: 'true' },
        { context: { mode: 'dev', isServer: false, browserRuntime: true, collecting: true }, userValue: 'true' },
      ])
      expect(browser.viteConfig.define?.FROM_PLUGIN).toBe('true')
    }
    finally {
      await closeContext(ctx)
    }
  })

  it('keeps browser mounts read-only while file updates still request collection', async () => {
    const ctx = createContext()
    const changed = vi.fn()
    const off = onStoryChange(ctx, changed)
    const handlers = new Map<string, () => void>()
    const server = { config: { base: '/', server: {} }, middlewares: { use: vi.fn() }, ws: { on: (event: string, listener: () => void) => handlers.set(event, listener) } } as any
    try {
      const { viteConfig } = await getViteConfigWithPlugins(false, ctx)
      const plugin = viteConfig.plugins.find(plugin => plugin?.name === 'histoire-vite-plugin') as any
      plugin.configureServer(server)
      for (let mount = 0; mount < 3; mount++) handlers.get('histoire:mount')?.()
      expect(changed).not.toHaveBeenCalled()
      plugin.handleHotUpdate({ file: ctx.storyFiles[0].path })
      expect(changed).toHaveBeenCalledExactlyOnceWith(ctx.storyFiles[0])
    }
    finally {
      off()
      closeDevPreviewHost(server)
      await closeContext(ctx)
    }
  })

  it('keeps visual capture active when the internal collection cache is rewritten', async () => {
    const ctx = createContext()
    ctx.config.visual = {}
    const server = {} as any
    const retired = vi.fn()
    const off = onVisualSourceRetired(server, retired)
    try {
      const { viteConfig } = await getViteConfigWithPlugins(false, ctx)
      const plugin = viteConfig.plugins.find(plugin => plugin?.name === 'histoire-vite-plugin') as any
      plugin.handleHotUpdate({ server, file: path.join(ctx.root, '.histoire/cache/collection/stories.bin') })
      expect(retired).not.toHaveBeenCalled()
      plugin.handleHotUpdate({ server, file: path.join(ctx.root, 'src/components/Example.vue') })
      expect(retired).toHaveBeenCalledOnce()
    }
    finally {
      off()
      await closeContext(ctx)
    }
  })

  it('lets Vitest 5 prebundle its browser runtime', async () => {
    const ctx = createContext()

    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
    })
    const resolvedConfig = await resolveConfig(viteConfig, 'serve')

    expect(resolvedConfig.optimizeDeps.exclude).not.toContain('vitest')
  }, 15000)

  it('pre-bundles the msw modules of the Vitest browser runtime up front', async () => {
    const ctx = createContext()
    try {
      const { viteConfig } = await getViteConfigWithPlugins(false, ctx)
      const resolvedConfig = await resolveConfig(viteConfig, 'serve')

      // Discovered when the first document loads them, they would reload it.
      expect(resolvedConfig.optimizeDeps.include).toEqual(expect.arrayContaining(['msw/browser', 'msw/core/http']))
    }
    finally {
      await closeContext(ctx)
    }
  }, 15000)

  it('allows packaged controls peer assets for the browser', async () => {
    const ctx = createContext()
    const { viteConfig } = await getViteConfigWithPlugins(false, ctx)
    const resolvedConfig = await resolveConfig(viteConfig, 'serve')

    expect(resolvedConfig.server.fs.allow).toContain(path.resolve(process.cwd(), '../histoire-controls'))
  }, 15000)

  it('keeps the workspace root allowed for client and collection servers', async () => {
    const ctx = createContext()
    const workspaceRoot = normalizePath(searchForWorkspaceRoot(process.cwd()))

    for (const isServer of [false, true]) {
      const { viteConfig } = await getViteConfigWithPlugins(isServer, ctx)
      const resolvedConfig = await resolveConfig(viteConfig, 'serve')

      expect(resolvedConfig.server.fs.allow).toContain(workspaceRoot)
    }
  }, 15000)

  it('does not import expect-type in the browser story vitest shim', async () => {
    const ctx = createContext()
    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
    })
    const storyShimPlugin = viteConfig.plugins?.find(plugin => plugin?.name === 'histoire:story-vitest-shim')

    expect(storyShimPlugin).toBeTruthy()

    const shimId = await storyShimPlugin!.resolveId?.('vitest', ctx.storyFiles[0].path)
    expect(shimId).toBeTruthy()

    const shimCode = await storyShimPlugin!.load?.(shimId as string)

    expect(shimCode).not.toContain('expect-type')
    expect(shimCode).toContain('export const expectTypeOf = createTypeExpect')
    expect(shimCode).toContain('createHistoireSuiteCollector()')
    expect(shimCode).toContain('createHistoireTestCollector()')
    expect(shimCode).toContain('registerCollectedTestHook')
    expect(shimCode).toContain('export function onTestFinished(callback, timeout)')
    expect(shimCode).toContain('export function onTestFailed(callback, timeout)')
    expect(shimCode).toContain('stubGlobal(name, value)')
    expect(shimCode).toContain('useFakeTimers()')
    expect(shimCode).toContain('waitFor: waitForValue')
    expect(shimCode).toContain(`unsupportedRuntimeFeature('vi.useFakeTimers')`)
    expect(shimCode).toContain(`unsupportedSnapshotResult`)
    expect(shimCode).toContain(`unsupportedRuntimeFeature('recordArtifact')`)
    expect(shimCode).toContain('providedContext?.[key]')
    expect(shimCode).toContain('createTypeExpect')
    for (const exportName of ['BenchmarkRunner', 'EvaluatedModules', 'TestRunner', 'bench', 'chai', 'createExpect']) {
      expect(shimCode, exportName).toMatch(new RegExp(`export (?:class|const|function|\\{) ${exportName}`))
    }
  })

  it('shims story files discovered after the config was built', async () => {
    const ctx = createContext()
    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
    })
    const storyShimPlugin = viteConfig.plugins?.find(plugin => plugin?.name === 'histoire:story-vitest-shim')

    // Story files discovered by the watcher AFTER server start (custom
    // storyMatch patterns not covered by the `.story.*` fallback) must still
    // get the browser vitest shim — a set frozen at startup would hand them
    // the node-oriented `vitest` entry, which breaks in the browser.
    const lateStoryPath = `${ctx.root}/src/components/Late.tale.vue`
    ctx.storyFiles.push({
      ...ctx.storyFiles[0],
      id: 'late-story-id',
      path: lateStoryPath,
      moduleId: lateStoryPath,
      relativePath: 'src/components/Late.tale.vue',
      fileName: 'Late',
    })

    expect(await storyShimPlugin!.resolveId?.('vitest', lateStoryPath)).toBeTruthy()
    // Child components and user setup/helpers register into the same collector.
    expect(await storyShimPlugin!.resolveId?.('vitest', `${ctx.root}/src/components/Example.vue`)).toBeTruthy()
    expect(await storyShimPlugin!.resolveId?.('vitest', `${ctx.root}/node_modules/@vitest/browser/dist/index.js`)).toBeFalsy()
  })

  it('resolves the browser collection vitest stub to the source file', async () => {
    const ctx = createContext()
    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
      collecting: true,
    })
    const collectStubPlugin = viteConfig.plugins?.find(plugin => plugin?.name === 'histoire:collect-story-vitest-stub')

    expect(collectStubPlugin).toBeTruthy()

    const resolvedId = await collectStubPlugin!.resolveId?.('vitest', ctx.storyFiles[0].path)

    expect(typeof resolvedId).toBe('string')
    expect(fs.existsSync(resolvedId as string)).toBe(true)
    expect(resolvedId).toMatch(/vendors\/vitest-collect\.(ts|js)$/)
  })

  it('uses the browser collection vitest stub for helper imports', async () => {
    const ctx = createContext()
    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
      collecting: true,
    })
    const collectStubPlugin = viteConfig.plugins?.find(plugin => plugin?.name === 'histoire:collect-story-vitest-stub')

    expect(collectStubPlugin).toBeTruthy()

    const resolvedId = await collectStubPlugin!.resolveId?.('vitest', `${ctx.root}/src/helpers/use-vitest.ts`)

    expect(typeof resolvedId).toBe('string')
    expect(resolvedId).toMatch(/vendors\/vitest-collect\.(ts|js)$/)
  })

  it('keeps Vitest browser internals on the real Vitest entry', async () => {
    const ctx = createContext()
    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
      collecting: true,
    })
    const collectStubPlugin = viteConfig.plugins?.find(plugin => plugin?.name === 'histoire:collect-story-vitest-stub')

    const resolvedId = await collectStubPlugin!.resolveId?.(
      'vitest',
      `${ctx.root}/node_modules/@vitest/browser/dist/expect-element.js`,
    )

    expect(resolvedId).toBeFalsy()
  })

  it('keeps generated browser collection specs on the real Vitest entry', async () => {
    const ctx = createContext()
    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
      collecting: true,
    })
    const collectStub = viteConfig.plugins?.find(plugin => plugin?.name === 'histoire:collect-story-vitest-stub')

    expect(await collectStub!.resolveId?.('vitest', `${ctx.root}/collect.histoire.spec.ts`)).toBeUndefined()
  })

  it('matches root-relative and query-suffixed story importers in browser collection mode', async () => {
    const ctx = createContext()
    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
      collecting: true,
    })
    const collectStubPlugin = viteConfig.plugins?.find(plugin => plugin?.name === 'histoire:collect-story-vitest-stub')

    expect(collectStubPlugin).toBeTruthy()

    const rootRelativeResolvedId = await collectStubPlugin!.resolveId?.('vitest', '/src/components/Example.story.vue')
    const querySuffixedResolvedId = await collectStubPlugin!.resolveId?.(
      'vitest',
      `/@fs/${ctx.storyFiles[0].path}?vue&type=script&setup=true&lang.ts`,
    )

    expect(typeof rootRelativeResolvedId).toBe('string')
    expect(typeof querySuffixedResolvedId).toBe('string')
    expect(rootRelativeResolvedId).toMatch(/vendors\/vitest-collect\.(ts|js)$/)
    expect(querySuffixedResolvedId).toMatch(/vendors\/vitest-collect\.(ts|js)$/)
  })

  it.each([undefined, 'true'])('resolves sandbox styles with HISTOIRE_DEV=%s', async (dev) => {
    vi.stubEnv('HISTOIRE_DEV', dev)
    // APP_PATH is selected at module load, so each mode needs fresh imports.
    vi.resetModules()
    try {
      const { getViteConfigWithPlugins } = await import('../vite/index.js')
      const { viteConfig } = await getViteConfigWithPlugins(false, createContext())
      const config = await resolveConfig(viteConfig, 'serve')
      const resolve = config.createResolver()
      const entry = path.resolve(process.cwd(), `../histoire-app/src/bundle-sandbox${dev ? '-dev' : ''}.js`)
      const source = fs.readFileSync(entry, 'utf8')
      const styles = [...source.matchAll(/import '(histoire-[^']*style)'/g)].map(match => match[1])

      expect(styles).toHaveLength(2)
      for (const style of styles) {
        const resolved = await resolve(style, entry)
        expect(resolved, style).toBeTruthy()
        expect(fs.existsSync(resolved!), `${style}: ${resolved}`).toBe(true)
      }
    }
    finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
