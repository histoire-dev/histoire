import type { Context } from '../context.js'
import fs from 'node:fs'
import path from 'node:path'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import { getDefaultConfig } from '../config.js'
import { getViteConfigWithPlugins } from '../vite.js'

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

  it('excludes vitest from optimized deps in browser runtime', async () => {
    const ctx = createContext()

    const { viteConfig } = await getViteConfigWithPlugins(false, ctx, {
      browserRuntime: true,
    })
    const resolvedConfig = await resolveConfig(viteConfig, 'serve')

    expect(resolvedConfig.optimizeDeps.exclude).toContain('vitest')
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
    expect(shimCode).toContain('export const expectTypeOf = () => ({})')
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

  it('uses compiled style aliases in the sandbox entry', () => {
    const sandboxEntry = fs.readFileSync(path.resolve(process.cwd(), '../histoire-app/src/bundle-sandbox.js'), 'utf8')

    expect(sandboxEntry).toContain(`import 'histoire-style'`)
    expect(sandboxEntry).toContain(`import 'histoire-bundled-style'`)
    expect(sandboxEntry).not.toContain(`import './app/style/sandbox.css'`)
  })
})
