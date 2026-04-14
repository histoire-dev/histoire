import type {
  InlineConfig,
  UserConfig as ViteConfig,
  Plugin as VitePlugin,
} from 'vite'
import type { Context } from './context.js'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { lookup as lookupMime } from 'mrmime'
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'pathe'
import {
  loadConfigFromFile as loadViteConfigFromFile,
  mergeConfig as mergeViteConfig,
} from 'vite'
import { APP_PATH, TEMP_PATH } from './alias.js'
import { createMarkdownPlugins } from './markdown.js'
import { notifyStoryChange } from './stories.js'
import { hasProjectVitest } from './util/has-vitest.js'
import { resolveHistoireSharedEntry } from './util/resolve-histoire-shared.js'
import { resolveVitestModule, tryResolveVitestModule } from './util/resolve-vitest-package.js'
import { createVirtualFilesPlugin } from './virtual/vite-plugin.js'

const require = createRequire(import.meta.url)
const histoireSharedPath = resolveHistoireSharedEntry()
const vitestCollectStubPath = resolveVitestCollectStubPath()
const STORY_VITEST_SHIM_ID = '\0virtual:$histoire-story-vitest'

export async function mergeHistoireViteConfig(viteConfig: InlineConfig, ctx: Context) {
  if (ctx.config.vite) {
    const command = ctx.mode === 'dev' ? 'serve' : 'build'
    const overrides = typeof ctx.config.vite === 'function'
      ? await ctx.config.vite(viteConfig as ViteConfig, {
        mode: ctx.mode,
        command,
      })
      : ctx.config.vite
    if (overrides) {
      viteConfig = mergeViteConfig(viteConfig, overrides)
    }
  }

  let flatPlugins = []
  if (viteConfig.plugins) {
    for (const pluginOption of viteConfig.plugins) {
      const resolvedPluginOption = await pluginOption
      if (Array.isArray(resolvedPluginOption)) {
        flatPlugins.push(...await Promise.all(resolvedPluginOption))
      }
      else {
        flatPlugins.push(resolvedPluginOption)
      }
    }
    flatPlugins = flatPlugins.filter(Boolean)
  }

  if (ctx.config.viteIgnorePlugins) {
    flatPlugins = flatPlugins.filter(plugin => !ctx.config.viteIgnorePlugins.includes(plugin.name))
  }

  viteConfig.plugins = flatPlugins

  return viteConfig
}

export interface ViteConfigWithPlugins {
  viteConfig: InlineConfig
  viteConfigFile: string | null
}

export interface GetViteConfigWithPluginsOptions {
  browserRuntime?: boolean
  collecting?: boolean
}

export async function getViteConfigWithPlugins(
  isServer: boolean,
  ctx: Context,
  options: GetViteConfigWithPluginsOptions = {},
): Promise<ViteConfigWithPlugins> {
  const userViteConfigFile = await loadViteConfigFromFile({ command: ctx.mode === 'dev' ? 'serve' : 'build', mode: ctx.mode })
  const userViteConfig = mergeViteConfig(userViteConfigFile?.config ?? {}, { server: { port: 6006 } })

  const inlineConfig = await mergeHistoireViteConfig(userViteConfig, ctx)
  const plugins: VitePlugin[] = []
  const projectHasVitest = hasProjectVitest(ctx.root)
  const storyImporterIds = new Set(ctx.storyFiles.flatMap((file) => {
    return [
      file.relativePath,
      file.path,
      file.moduleId,
      toRootRelativeStoryImporterId(file.path, ctx.root),
      toRootRelativeStoryImporterId(file.moduleId, ctx.root),
    ]
      .filter((value): value is string => !!value && !value.startsWith('\0'))
      .map(normalizeStoryImporterId)
  }))
  const supportPluginAllowPaths = ctx.supportPlugins.flatMap((plugin) => {
    const paths = [ctx.root, import.meta.url]
    const result = new Set<string>()

    for (const suffix of ['', '/client', '/collect']) {
      try {
        const resolved = require.resolve(`${plugin.moduleName}${suffix}`, {
          paths,
        })
        result.add(dirname(resolved))
      }
      catch {
        // Noop
      }
    }

    return Array.from(result)
  })

  function optimizeDeps(deps: string[]): string[] {
    const result = []
    for (const dep of deps) {
      result.push(dep)
      try {
        result.push(dirname(require.resolve(`${dep}/package.json`)))
      }
      catch (e) {
        // Noop
      }
    }
    return result
  }

  const browserRuntimeAllowPaths = projectHasVitest
    ? [
        'vitest/package.json',
        '@vitest/browser/package.json',
        '@vitest/expect/package.json',
        '@vitest/mocker/package.json',
        '@vitest/spy/package.json',
        '@testing-library/dom/package.json',
        '@testing-library/user-event/package.json',
      ].flatMap((id) => {
        const resolved = tryResolveVitestModule(ctx.root, id) ?? (() => {
          try {
            return require.resolve(id)
          }
          catch {
            return null
          }
        })()
        return resolved ? [dirname(resolved)] : []
      })
    : []

  const browserStoryVitestPath = projectHasVitest
    ? tryResolveVitestModule(ctx.root, 'vitest')
    : null
  const browserStoryVitestExpectPath = projectHasVitest
    ? tryResolveVitestModule(ctx.root, '@vitest/expect')
    : null
  const browserStoryVitestMockerBrowserPath = projectHasVitest
    ? tryResolveVitestModule(ctx.root, '@vitest/mocker/browser')
    : null
  const browserStoryVitestSpyPath = projectHasVitest
    ? tryResolveVitestModule(ctx.root, '@vitest/spy')
    : null
  plugins.push({
    name: 'histoire-vite-plugin',

    config(_, { command }) {
      const optimizeEntries = options.browserRuntime
        ? []
        : [
            `${APP_PATH}/bundle-main.js`,
            `${APP_PATH}/bundle-sandbox.js`,
          ]
      const optimizeInclude = options.browserRuntime
        ? []
        : optimizeDeps([
            'flexsearch',
            'shiki',
            'vscode-oniguruma',
            'vscode-textmate',
          ])

      return {
        resolve: {
          dedupe: [
            'vue',
          ],
          alias: [
            {
              find: 'histoire-style',
              replacement: join(APP_PATH, process.env.HISTOIRE_DEV ? 'app/style/main.pcss' : 'style.css'),
            },
            {
              find: 'histoire-bundled-style',
              replacement: join(APP_PATH, 'bundled/app.css'),
            },
            {
              find: /^@histoire\/shared$/,
              replacement: histoireSharedPath,
            },
          ],
          ...(isServer
            ? {
              // Force resolving deps like Node.JS resolution algorithm (in case some modules are not loaded with ssr: true e.g. .vue files)
                conditions: ['node'],
              }
            : {}),
        },
        optimizeDeps: {
          entries: optimizeEntries,
          include: optimizeInclude,
          noDiscovery: options.browserRuntime,
          exclude: [
            'histoire',
            '@histoire/vendors',
            ...options.browserRuntime
              ? ['vitest']
              : [],
          ],
        },
        server: {
          fs: {
            allow: [
              APP_PATH,
              TEMP_PATH,
              ctx.resolvedViteConfig.root,
              process.cwd(),
              ...supportPluginAllowPaths,
              ...browserRuntimeAllowPaths,
              ...process.env.HISTOIRE_DEV
                ? [
                    '../../packages/histoire-vendors',
                  ]
                : [],
            ],
          },
          watch: {
            ignored: [`!**/node_modules/.histoire/**`, '**/vite.config.*'],
          },
          hmr: command === 'build' ? false : !isServer,
        },
        define: {
          // We need to force this to be able to use `devtoolsRawSetupState`
          '__VUE_PROD_DEVTOOLS__': 'true',
          // Disable warnings
          'process.env.NODE_ENV': JSON.stringify(isServer ? 'production' : process.env.NODE_ENV ?? 'development'),
          ...!isServer
            ? {
              // Collect flag
                'process.env.HST_COLLECT': 'false',
              }
            : {},
          '__HST_COLLECT__': isServer,
        },
        cacheDir: options.browserRuntime
          ? (isServer ? 'node_modules/.hst-vite-browser-server' : 'node_modules/.hst-vite-browser')
          : (isServer ? 'node_modules/.hst-vite-server' : 'node_modules/.hst-vite'),
      }
    },

    options() {
      (this.meta as any).histoire = {
        isCollecting: isServer,
      }
    },

    handleHotUpdate(updateContext) {
      const story = ctx.storyFiles.find(file => file.path === updateContext.file)
      if (story) {
        notifyStoryChange(story)
      }
    },

    configureServer(server) {
      let firstMount = true
      server.ws.on('histoire:mount', () => {
        if (!firstMount) {
          notifyStoryChange()
        }
        firstMount = false
      })

      server.middlewares.use(async (req, res, next) => {
        if (req.url!.startsWith(`${server.config.base}__sandbox`)) {
          res.statusCode = 200
          let html = `
<!DOCTYPE html>
<html>
<head>
  <title></title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="">
</head>
<body>
  <div id="app"></div>
  <script>
  (() => {
    const runner = globalThis.__vitest_browser_runner__ ?? {}
    if (typeof runner.wrapDynamicImport !== 'function') {
      runner.wrapDynamicImport = loader => loader()
    }
    globalThis.__vitest_browser_runner__ = runner
  })()
  </script>
  <script>
  // Hide spammy vite messages
  const origConsoleLog = console.log
  console.log = (...args) => {
    if (typeof args[0] !== 'string' || !args[0].startsWith('[vite] connect')) {
      origConsoleLog(...args)
    }
  }
  </script>
  <script type="module" src="/@fs/${APP_PATH}/bundle-sandbox${process.env.HISTOIRE_DEV ? '-dev' : ''}.js"></script>
</body>
</html>`
          // Apply Vite HTML transforms. This injects the Vite HMR client, and
          // also applies HTML transforms from Vite plugins
          html = await server.transformIndexHtml(req.url, html)
          res.setHeader('content-type', 'text/html; charset=UTF-8')
          res.end(html)
          return
        }
        next()
      })

      // serve our index.html after vite history fallback
      return () => {
        server.middlewares.use(async (req, res, next) => {
          if (req.url!.endsWith('.html')) {
            res.statusCode = 200

            let html = `
<!DOCTYPE html>
<html>
  <head>
    <title></title>
    <link rel="icon" href=""/>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="description" content="">
    ${ctx.config.theme?.favicon ? `<link rel="icon" type="${lookupMime(ctx.config.theme.favicon)}" href="${server.config.base}${ctx.config.theme.favicon}"/>` : ''}
  </head>
  <body>
    <div id="app"></div>
    <script>
    (() => {
      const runner = globalThis.__vitest_browser_runner__ ?? {}
      if (typeof runner.wrapDynamicImport !== 'function') {
        runner.wrapDynamicImport = loader => loader()
      }
      globalThis.__vitest_browser_runner__ = runner
    })()
    </script>
    <script type="module" src="/@fs/${APP_PATH}/bundle-main${process.env.HISTOIRE_DEV ? '-dev' : ''}.js"></script>
  </body>
</html>`
            // Apply Vite HTML transforms. This injects the Vite HMR client, and
            // also applies HTML transforms from Vite plugins
            html = await server.transformIndexHtml(req.url, html)
            res.setHeader('content-type', 'text/html; charset=UTF-8')
            res.end(html)
            return
          }
          next()
        })
      }
    },
  })

  plugins.push(createVirtualFilesPlugin(ctx, isServer))

  if (!isServer && options.browserRuntime && options.collecting) {
    plugins.push({
      name: 'histoire:collect-story-vitest-stub',
      enforce: 'pre',
      resolveId(id, importer) {
        // Browser collect must keep bare `vitest` imports so core resolve can
        // remap them after Vite normalizes Vue SFC importer ids.
        if (id === 'vitest' && isStoryVitestImporter(importer, storyImporterIds, ctx.root)) {
          return vitestCollectStubPath
        }
      },
    })
  }

  if (!isServer
    && !options.collecting
    && projectHasVitest
    && browserStoryVitestExpectPath
    && browserStoryVitestMockerBrowserPath
    && browserStoryVitestSpyPath) {
    plugins.push({
      name: 'histoire:story-vitest-shim',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id === 'vitest' && isStoryVitestImporter(importer, storyImporterIds, ctx.root)) {
          return STORY_VITEST_SHIM_ID
        }
      },
      load(id) {
        if (id !== STORY_VITEST_SHIM_ID) {
          return
        }

        return `
import { registerCollectedTestCase, registerCollectedTestSuite } from ${JSON.stringify(histoireSharedPath)}
import { createCompilerHints } from ${JSON.stringify(browserStoryVitestMockerBrowserPath)}
import { chai, JestAsymmetricMatchers, JestChaiExpect, JestExtend, ASYMMETRIC_MATCHERS_OBJECT, GLOBAL_EXPECT, addCustomEqualityTesters, customMatchers, getState, setState } from ${JSON.stringify(browserStoryVitestExpectPath)}
import { clearAllMocks, fn, isMockFunction, resetAllMocks, restoreAllMocks, spyOn } from ${JSON.stringify(browserStoryVitestSpyPath)}

chai.use(JestExtend)
chai.use(JestChaiExpect)
chai.use(JestAsymmetricMatchers)

function createPreviewExpect() {
  const expect = (value, message) => {
    const { assertionCalls = 0 } = getState(expect) ?? {}
    setState({ assertionCalls: assertionCalls + 1 }, expect)
    return chai.expect(value, message)
  }

  Object.assign(expect, chai.expect)
  Object.assign(expect, globalThis[ASYMMETRIC_MATCHERS_OBJECT])

  expect.getState = () => getState(expect)
  expect.setState = state => setState(state, expect)

  setState({
    assertionCalls: 0,
    isExpectingAssertions: false,
    isExpectingAssertionsError: null,
    expectedAssertionsNumber: null,
    expectedAssertionsNumberErrorGen: null,
    currentTestName: '',
  }, expect)

  expect.assert = chai.assert
  expect.extend = matchers => chai.expect.extend(expect, matchers)
  expect.addEqualityTesters = customTesters => addCustomEqualityTesters(customTesters)
  expect.soft = (...args) => expect(...args).withContext({ soft: true })
  expect.unreachable = message => {
    chai.assert.fail(\`expected\${message ? \` "\${message}" \` : ' '}not to be reached\`)
  }

  chai.util.addMethod(expect, 'assertions', expected => {
    const errorGen = () => new Error(\`expected number of assertions to be \${expected}, but got \${expect.getState().assertionCalls}\`)
    expect.setState({
      expectedAssertionsNumber: expected,
      expectedAssertionsNumberErrorGen: errorGen,
    })
  })

  chai.util.addMethod(expect, 'hasAssertions', () => {
    expect.setState({
      isExpectingAssertions: true,
      isExpectingAssertionsError: new Error('expected any number of assertion, but got none'),
    })
  })

  expect.extend(customMatchers)

  return expect
}

const expect = globalThis[GLOBAL_EXPECT] ?? createPreviewExpect()
if (globalThis[GLOBAL_EXPECT] !== expect) {
  Object.defineProperty(globalThis, GLOBAL_EXPECT, {
    value: expect,
    writable: true,
    configurable: true,
  })
}

const compilerHints = createCompilerHints({
  globalThisKey: '__vitest_mocker__',
})

export const vi = {
  ...compilerHints,
  clearAllMocks,
  fn,
  isMockFunction,
  mocked(value) {
    return value
  },
  resetAllMocks,
  restoreAllMocks,
  spyOn,
}

export const vitest = vi
export { expect }
export const assert = chai.assert
export const should = chai.should
export const expectTypeOf = () => ({})
export function inject() {}
export const mocker = globalThis.__vitest_mocker__
export function onTestFailed() {}

export function describe(name, fn) {
  registerCollectedTestSuite(name, fn)
}

export function it(name, fn) {
  registerCollectedTestCase(name, fn)
}

export const test = it

export function beforeAll() {}
export function beforeEach() {}
export function afterAll() {}
export function afterEach() {}
`
      },
    })
  }

  if (isServer && !options.browserRuntime) {
    plugins.push({
      name: 'histoire:collect-vitest-stub',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'vitest') {
          return vitestCollectStubPath
        }
      },
    })
  }

  // Skip mocker plugin in browserRuntime mode (collection + test phases).
  // The mocker rewrites dynamic imports to use __vitest_mocker__.wrapDynamicImport()
  // but __vitest_mocker__ isn't initialized by vitest in histoire's browser context.
  // Histoire's own test-harness already wraps dynamic imports safely via
  // runWithVitestDynamicImport().
  if (!isServer && projectHasVitest && !options.browserRuntime) {
    const mockerModuleId = resolveVitestModule(ctx.root, '@vitest/mocker/node')
    const mocker = await import(mockerModuleId)
    if (ctx.mode === 'dev') {
      plugins.push(...mocker.mockerPlugin({
        globalThisAccessor: '"__vitest_mocker__"',
      }))
    }
    else {
      plugins.push(
        mocker.hoistMocksPlugin(),
        mocker.automockPlugin(),
        mocker.dynamicImportPlugin({
          globalThisAccessor: '"__vitest_browser_runner__"',
        }),
      )
    }
  }

  // Replace dev flag
  const flags = {
    '_ctx.__HISTOIRE_DEV__': JSON.stringify(ctx.mode === 'dev'),
    '__HISTOIRE_DEV__': JSON.stringify(ctx.mode === 'dev'),
  }
  plugins.push({
    name: 'histoire:flags',
    enforce: 'pre',
    transform(code, id) {
      if (id.match(/\.(vue|js)($|\?)/)) {
        const original = code
        for (const flag in flags) {
          code = code.replace(new RegExp(flag, 'g'), flags[flag])
        }
        if (original !== code) return code
      }
    },
  })

  if (ctx.mode === 'dev') {
    // Dev commands
    plugins.push({
      name: 'histoire:dev-commands',
      configureServer(server) {
        server.ws.on('histoire:dev-command', ({ id, params }) => {
          const command = ctx.registeredCommands.find(c => c.id === id)
          if (command?.serverAction) {
            command.serverAction(params)
          }
        })
      },
    })
  }

  // Markdown
  plugins.push(...await createMarkdownPlugins(ctx))

  if (ctx.mode === 'build') {
    // Add file name in build mode to have components names instead of <Anonymous>
    const include = [/\.vue$/]
    const exclude = [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]\.nuxt[\\/]/]
    plugins.push({
      name: 'histoire-file-name-plugin',
      enforce: 'post',

      transform(code, id) {
        if (exclude.some(r => r.test(id))) return
        if (include.some(r => r.test(id))) {
          const file = relative(ctx.resolvedViteConfig.root, id)
          const index = code.indexOf('export default')
          const result = `${code.substring(0, index)}_sfc_main.__file = '${file}'\n${code.substring(index)}`
          return result
        }
      },
    })
  }

  if (process.env.HISTOIRE_DEV && !isServer) {
    plugins.push({
      name: 'histoire-dev-plugin',
      config() {
        // Examples context
        return {
          resolve: {
            alias: [
              ...[
                ['floating-vue/dist/style.css', 'node_modules/floating-vue/dist/style.css'],
                ['floating-vue', 'floating-vue'],
                ['@iconify/vue', 'iconify'],
                ['pinia', 'pinia'],
                ['scroll-into-view-if-needed', 'scroll'],
                ['vue-router', 'vue-router'],
                ['@vueuse/core', 'vue-use'],
                ['vue', 'vue'],
              ].reduce((acc, [name, entry]) => {
                acc.push({
                  find: new RegExp(`^${name.replace(/\//g, '\\/')}$`),
                  replacement: `@histoire/vendors/${entry}`,
                })
                acc.push({
                  find: new RegExp(`^${name.replace(/\//g, '\\/')}\\/`),
                  replacement: `@histoire/vendors/${entry}/`,
                })
                return acc
              }, [] as any[]),

              { find: /@histoire\/controls$/, replacement: '@histoire/controls/src/index.ts' },
            ],
          },
        }
      },
    })
  }

  for (const plugin of ctx.config.plugins) {
    if (plugin.vitePlugins) {
      await plugin.vitePlugins(plugins)
    }
  }

  const viteConfig = mergeViteConfig(inlineConfig, {
    configFile: false,
    plugins,
  }) as InlineConfig

  return {
    viteConfig,
    viteConfigFile: userViteConfigFile?.path ?? null,
  }
}

/**
 * Matches story importers across raw file paths, root-relative ids, and Vite's
 * normalized `/@fs/...?vue` Vue SFC submodule ids.
 */
function isStoryVitestImporter(importer: string | undefined, storyImporterIds: Set<string>, root: string) {
  if (!importer) {
    return false
  }

  for (const candidate of getStoryVitestImporterCandidates(importer, root)) {
    if (storyImporterIds.has(candidate) || /\.story\.[^/]+$/.test(candidate)) {
      return true
    }
  }

  return false
}

function getStoryVitestImporterCandidates(importer: string, root: string) {
  const normalized = normalizeStoryImporterId(importer)
  const result = new Set<string>([normalized])
  const withoutLeadingSlash = normalized.replace(/^\/+/, '')

  if (withoutLeadingSlash && withoutLeadingSlash !== normalized) {
    result.add(withoutLeadingSlash)
  }

  const rootRelative = toRootRelativeStoryImporterId(normalized, root)
  if (rootRelative) {
    result.add(rootRelative)
    result.add(rootRelative.slice(1))
  }

  return result
}

function normalizeStoryImporterId(value: string) {
  const id = value.split('?')[0]
  return normalize(id.startsWith('/@fs/') ? id.slice(4) : id)
}

/**
 * Uses bundled `.js` when running built package code and source `.ts` during
 * local source execution.
 */
function resolveVitestCollectStubPath() {
  const jsPath = resolve(import.meta.dirname, 'vendors/vitest-collect.js')
  if (existsSync(jsPath)) {
    return jsPath
  }

  return resolve(import.meta.dirname, 'vendors/vitest-collect.ts')
}

function toRootRelativeStoryImporterId(value: string | undefined, root: string) {
  if (!value) {
    return null
  }

  const normalizedValue = normalize(value)
  const normalizedRoot = normalize(root)

  if (!isAbsolute(normalizedValue)
    || (normalizedValue !== normalizedRoot && !normalizedValue.startsWith(`${normalizedRoot}/`))) {
    return null
  }

  return `/${relative(normalizedRoot, normalizedValue)}`
}
