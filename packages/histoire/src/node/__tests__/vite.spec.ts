import type { Context } from '../context.js'
import fs from 'node:fs'
import path from 'node:path'
import { resolveConfig } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultConfig } from '../config/index.js'
import { closeContext } from '../context.js'
import { onStoryChange } from '../stories.js'
import { getViteConfigWithPlugins } from '../vite/index.js'
import { closeDevPreviewHost } from '../vite/mcp-preview-html.js'
import { createVitestBrowserRuntimeConfig } from '../vitest-browser-config/index.js'

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

  it('excludes vitest from optimized deps in browser runtime', async () => {
    const ctx = createContext()

    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
    })
    const resolvedConfig = await resolveConfig(viteConfig, 'serve')

    expect(resolvedConfig.optimizeDeps.exclude).toContain('vitest')
  }, 15000)

  it('allows packaged controls peer assets for the browser', async () => {
    const ctx = createContext()
    const { viteConfig } = await getViteConfigWithPlugins(false, ctx)
    const resolvedConfig = await resolveConfig(viteConfig, 'serve')

    expect(resolvedConfig.server.fs.allow).toContain(path.resolve(process.cwd(), '../histoire-controls'))
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
    // Non-story importers keep resolving the real vitest entry.
    expect(await storyShimPlugin!.resolveId?.('vitest', `${ctx.root}/src/components/Example.vue`)).toBeFalsy()
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

  it('resolves @vitest/runner for generated browser collection specs', async () => {
    const ctx = createContext()
    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
      collecting: true,
    })
    const runtimeConfig = await createVitestBrowserRuntimeConfig(ctx, viteConfig)
    const browserResolvePlugin = runtimeConfig.vitestOptions.plugins.find(plugin => plugin?.name === 'histoire-vitest-browser-resolve')

    expect(browserResolvePlugin).toBeTruthy()

    const resolvedId = await browserResolvePlugin!.resolveId?.('@vitest/runner')

    expect(typeof resolvedId).toBe('string')
    expect(resolvedId).toMatch(/@vitest[+/]runner/)
  }, 15000)

  it('excludes Vitest public entry dependencies from the browser optimizer', async () => {
    const ctx = createContext()
    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
      collecting: true,
    })
    const runtimeConfig = await createVitestBrowserRuntimeConfig(ctx, viteConfig)
    const optimizer = runtimeConfig.viteConfig.test.deps.optimizer.client

    expect(optimizer.exclude).toContain('vitest')
    expect(optimizer.exclude).toContain('expect-type')
    expect(optimizer.exclude).toContain('@vitest/expect')
    expect(optimizer.exclude).toContain('@vitest/snapshot')
    expect(optimizer.exclude).toContain('vitest > expect-type')
    expect(optimizer.exclude).toContain('vitest > @vitest/expect > chai')
    expect(optimizer.exclude).toContain('vitest > @vitest/snapshot > magic-string')
  }, 15000)

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
