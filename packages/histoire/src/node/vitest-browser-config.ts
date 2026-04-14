import type { InlineConfig, Plugin as VitePlugin } from 'vite'
import type { BrowserProviderOption, Vitest } from 'vitest/node'
import type { Context } from './context.js'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'pathe'
import { resolveVitestModule } from './util/resolve-vitest-package.js'
import {
  BROWSER_COLLECTOR_ID,
  GENERATED_GLOBAL_SETUP,
  GENERATED_SETUP_CODE,
  NOOP_ID,
  PREVIEW_RUNTIME_ID,
  RESOLVED_BROWSER_COLLECTOR_ID,
  RESOLVED_GENERATED_GLOBAL_SETUP,
  RESOLVED_GENERATED_SETUP_CODE,
  RESOLVED_PREVIEW_RUNTIME_ID,
  RESOLVED_TEST_HARNESS_ID,
  SETUP_ID,
  TEST_HARNESS_ID,
} from './virtual/index.js'
import { ID_SEPARATOR } from './virtual/util.js'

const require = createRequire(import.meta.url)
const histoireRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

interface VitestBrowserRuntimeConfigResult {
  vitestOptions: {
    plugins: VitePlugin[]
  }
  viteConfig: InlineConfig & {
    test: Record<string, any>
  }
}

function getResolvedIds(root?: string) {
  const resolveFromVitest = (id: string) => resolveVitestModule(root ?? histoireRoot, id)
  const vitestDir = dirname(resolveFromVitest('vitest/package.json'))
  const vitestBrowserDir = dirname(resolveFromVitest('@vitest/browser/package.json'))

  return {
    'vitest': resolve(vitestDir, 'dist/index.js'),
    'vitest/internal/browser': resolve(vitestDir, 'dist/browser.js'),
    '@vitest/browser/dist/context.js': resolve(vitestBrowserDir, 'dist/context.js'),
    'vitest/runners': resolve(vitestDir, 'dist/runners.js'),
    '@testing-library/dom': require.resolve('@testing-library/dom'),
    '@testing-library/user-event': require.resolve('@testing-library/user-event'),
    [BROWSER_COLLECTOR_ID]: RESOLVED_BROWSER_COLLECTOR_ID,
    [TEST_HARNESS_ID]: RESOLVED_TEST_HARNESS_ID,
    [PREVIEW_RUNTIME_ID]: RESOLVED_PREVIEW_RUNTIME_ID,
  }
}

export function debugVitestBrowserLifecycle(...args: unknown[]) {
  if (process.env.HST_DEBUG_BROWSER) {
    console.log('[histoire:browser]', ...args)
  }
}

export function createVitestBrowserResolvePlugin(ctx?: Context, isServer = false): VitePlugin {
  const resolvedIds = getResolvedIds(ctx?.root)

  return {
    name: 'histoire-vitest-browser-resolve',
    enforce: 'pre',
    async resolveId(id, importer) {
      if (id in resolvedIds) {
        return resolvedIds[id]
      }

      if (id.startsWith(GENERATED_GLOBAL_SETUP)) {
        return RESOLVED_GENERATED_GLOBAL_SETUP
      }

      if (id.startsWith(GENERATED_SETUP_CODE)) {
        const [, index] = id.split(ID_SEPARATOR)
        return `${RESOLVED_GENERATED_SETUP_CODE}${ID_SEPARATOR}${index}`
      }

      if (id.startsWith('virtual:story:')) {
        return `\0${id}`
      }

      if (id.startsWith(SETUP_ID)) {
        const setupFileConfig = ctx?.config.setupFile
        if (!setupFileConfig) {
          return NOOP_ID
        }

        let file: string | undefined
        if (typeof setupFileConfig === 'string') {
          file = setupFileConfig
        }
        else if (isServer && 'server' in setupFileConfig) {
          file = setupFileConfig.server
        }
        else if (!isServer && 'browser' in setupFileConfig) {
          file = setupFileConfig.browser
        }

        if (!file || !ctx) {
          return NOOP_ID
        }

        return await this.resolve(resolve(ctx.root, file), importer, {
          skipSelf: true,
        })
      }
    },
  }
}

async function getVitestBrowserProjectConfig(root: string, plugins: VitePlugin[] = []) {
  const { playwright } = await import(resolveVitestModule(root, '@vitest/browser-playwright'))
  return {
    browser: {
      enabled: true,
      ui: false,
      headless: true,
      provider: wrapBrowserProviderWithPlugins(playwright(), plugins),
      instances: [
        {
          browser: 'chromium' as const,
        },
      ],
    },
    plugins,
  }
}

function getVitestBrowserOptimizeDeps(ctx: Context) {
  const deps = new Set<string>()

  function addDep(dep: string) {
    deps.add(dep)
    try {
      deps.add(dirname(require.resolve(`${dep}/package.json`)))
    }
    catch {}
  }

  for (const dep of getVitestBrowserDependencyNames(ctx)) {
    addDep(dep)
  }

  return [...deps]
}

function getVitestBrowserDependencyNames(ctx: Context) {
  const deps = new Set<string>()

  if (ctx.supportPlugins.some(plugin => plugin.id === 'vue3')) {
    deps.add('vue')
    deps.add('pinia')
    deps.add('floating-vue')
    deps.add('@vueuse/core')
  }

  if (ctx.supportPlugins.some(plugin => plugin.id === 'svelte')) {
    deps.add('svelte')
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(resolve(ctx.root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    for (const dep of [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ]) {
      if (
        dep !== 'histoire'
        && dep !== 'vite'
        && dep !== 'vitest'
        && !dep.startsWith('@histoire/')
        && !dep.startsWith('@vitest/')
        && !dep.startsWith('@vue/')
      ) {
        deps.add(dep)
      }
    }
  }
  catch {}

  return [...deps]
}

export async function createVitestBrowserRuntimeConfig(
  ctx: Context,
  viteConfig: InlineConfig,
  options: {
    isServer?: boolean
    define?: Record<string, string>
    optimizeDeps?: {
      entries?: string[]
      include?: string[]
      noDiscovery?: boolean
      force?: boolean
    }
    test?: Record<string, any>
    resolveAlias?: Record<string, string>
  } = {},
): Promise<VitestBrowserRuntimeConfigResult> {
  const plugins = [...((viteConfig.plugins as VitePlugin[] | undefined) ?? [])]
  plugins.push(createVitestBrowserResolvePlugin(ctx, options.isServer))
  const defaultTest = await getVitestBrowserProjectConfig(ctx.root, plugins)
  const browserDependencyNames = getVitestBrowserDependencyNames(ctx)

  return {
    vitestOptions: {
      plugins,
    },
    viteConfig: {
      ...(viteConfig as InlineConfig & { test?: Record<string, any> }),
      resolve: {
        ...viteConfig.resolve,
        alias: {
          ...(viteConfig.resolve && 'alias' in viteConfig.resolve ? viteConfig.resolve.alias : {}),
          ...options.resolveAlias,
        },
      },
      define: {
        ...viteConfig.define,
        ...options.define,
      },
      optimizeDeps: {
        ...viteConfig.optimizeDeps,
        ...options.optimizeDeps,
        include: [
          ...new Set([
            ...getVitestBrowserOptimizeDeps(ctx),
            ...((options.optimizeDeps?.include ?? [])),
          ]),
        ],
        noDiscovery: options.optimizeDeps?.noDiscovery ?? viteConfig.optimizeDeps?.noDiscovery,
        force: options.optimizeDeps?.force ?? viteConfig.optimizeDeps?.force,
      },
      plugins,
      test: {
        ...defaultTest,
        ...options.test,
        deps: {
          optimizer: {
            client: {
              enabled: true,
              include: browserDependencyNames,
              entries: options.optimizeDeps?.entries ?? viteConfig.optimizeDeps?.entries ?? [],
              force: options.optimizeDeps?.force ?? viteConfig.optimizeDeps?.force,
            },
          },
          ...options.test?.deps,
        },
        browser: {
          ...defaultTest.browser,
          ...options.test?.browser,
        },
      },
    },
  }
}

export async function closeVitestBrowserResources(vitest: Vitest) {
  const projects = Array.isArray((vitest as any).projects) ? [...(vitest as any).projects] : []
  if ((vitest as any).coreWorkspaceProject) {
    projects.push((vitest as any).coreWorkspaceProject)
  }

  await Promise.all(projects.map(async (project: any) => {
    const httpServer = project?.browser?.vite?.httpServer
    if (httpServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close(error => error ? reject(error) : resolve())
      })
    }
  }))
}

function wrapBrowserProviderWithPlugins(
  provider: BrowserProviderOption,
  plugins: VitePlugin[],
): BrowserProviderOption {
  return {
    ...provider,
    async serverFactory(options: any) {
      const project = options.project as any
      project.options ??= {}
      project.options.plugins = plugins
      return await provider.serverFactory(options)
    },
  } as BrowserProviderOption
}

export function assignVitestBrowserProjectOptions(vitest: Vitest, options: { plugins: VitePlugin[] }) {
  const projects = Array.isArray((vitest as any).projects) ? [...(vitest as any).projects] : []
  if ((vitest as any).coreWorkspaceProject) {
    projects.push((vitest as any).coreWorkspaceProject)
  }

  for (const project of projects) {
    project.options ??= {}
    project.options.plugins = options.plugins
  }
}
