import { createRequire } from 'module'
import { relative, resolve, join, dirname } from 'pathe'
import {
  resolveConfig as resolveViteConfigInternal,
  Plugin as VitePlugin,
  UserConfig as ViteConfig,
  ResolvedConfig,
  InlineConfig,
  mergeConfig as mergeViteConfig,
  loadConfigFromFile as loadViteConfigFromFile,
} from 'vite'
import { lookup as lookupMime } from 'mrmime'
import { APP_PATH, TEMP_PATH } from './alias.js'
import { Context } from './context.js'
import { notifyStoryChange } from './stories.js'
import { makeTree } from './tree.js'
import { parseColor } from './colors.js'
import { createMarkdownPlugins } from './markdown.js'
import { getSearchDataJS, generateDocSearchData, generateTitleSearchData } from './search.js'
import { getInjectedImport } from './util/vendors.js'

const require = createRequire(import.meta.url)

export const STORIES_ID = '$histoire-stories'
export const RESOLVED_STORIES_ID = `/${STORIES_ID}-resolved`
export const SETUP_ID = '$histoire-setup'
export const NOOP_ID = '/$histoire-noop'
export const CONFIG_ID = '$histoire-config'
export const RESOLVED_CONFIG_ID = `/${CONFIG_ID}-resolved`
export const THEME_ID = '$histoire-theme'
export const RESOLVED_THEME_ID = `/${THEME_ID}-resolved.css`
export const SEARCH_TITLE_DATA_ID = '$histoire-search-title-data'
export const RESOLVED_SEARCH_TITLE_DATA_ID = `/${SEARCH_TITLE_DATA_ID}-resolved`
export const SEARCH_DOCS_DATA_ID = '$histoire-search-docs-data'
export const RESOLVED_SEARCH_DOCS_DATA_ID = `/${SEARCH_DOCS_DATA_ID}-resolved`
export const GENERATED_GLOBAL_SETUP = '$histoire-generated-global-setup'
export const RESOLVED_GENERATED_GLOBAL_SETUP = `/${GENERATED_GLOBAL_SETUP}-resolved`
export const GENERATED_SETUP_CODE = '$histoire-generated-setup-code'
export const RESOLVED_GENERATED_SETUP_CODE = `/${GENERATED_SETUP_CODE}-resolved`
export const SUPPORT_PLUGINS_CLIENT = 'virtual:$histoire-support-plugins-client'
export const RESOLVED_SUPPORT_PLUGINS_CLIENT = `\0${SUPPORT_PLUGINS_CLIENT}`
export const SUPPORT_PLUGINS_COLLECT = 'virtual:$histoire-support-plugins-collect'
export const RESOLVED_SUPPORT_PLUGINS_COLLECT = `\0${SUPPORT_PLUGINS_COLLECT}`
export const MARKDOWN_FILES = 'virtual:$histoire-markdown-files'
export const RESOLVED_MARKDOWN_FILES = `\0${MARKDOWN_FILES}`

export async function resolveViteConfig (ctx: Context): Promise<ResolvedConfig> {
  const command = ctx.mode === 'dev' ? 'serve' : 'build'
  let viteConfig = (await resolveViteConfigInternal({}, command)) as unknown
  viteConfig = mergeHistoireViteConfig(viteConfig, ctx)
  return viteConfig as ResolvedConfig
}

async function mergeHistoireViteConfig (viteConfig: InlineConfig, ctx: Context) {
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
      if (Array.isArray(pluginOption)) {
        flatPlugins.push(...await Promise.all(pluginOption))
      } else {
        flatPlugins.push(await pluginOption)
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

export async function getViteConfigWithPlugins (isServer: boolean, ctx: Context): Promise<InlineConfig> {
  const resolvedViteConfig = await resolveViteConfig(ctx)

  const userViteConfig = await loadViteConfigFromFile({ command: ctx.mode === 'dev' ? 'serve' : 'build', mode: ctx.mode })

  const inlineConfig = await mergeHistoireViteConfig(userViteConfig?.config ?? {}, ctx)
  const plugins: VitePlugin[] = []

  function optimizeDeps (deps: string[]): string[] {
    const result = []
    for (const dep of deps) {
      try {
        result.push(dirname(require.resolve(`${dep}/package.json`)))
      } catch (e) {
        // Noop
      }
    }
    return result
  }

  plugins.push({
    name: 'histoire-vite-plugin',

    config () {
      return {
        resolve: {
          dedupe: [
            'vue',
          ],
          alias: {
            'histoire-style': join(APP_PATH, 'style.css'),
          },
        },
        optimizeDeps: {
          entries: [
            `${APP_PATH}/bundle-main.js`,
            `${APP_PATH}/bundle-sandbox.js`,
          ],
          include: optimizeDeps([
            'case',
            'flexsearch',
            'shiki',
            // Shiki dependencies
            'vscode-oniguruma',
            'vscode-textmate',
          ]),
          exclude: [
            'histoire',
            '@histoire/vendors',
          ],
        },
        server: {
          fs: {
            allow: [
              APP_PATH,
              TEMP_PATH,
              resolvedViteConfig.root,
              process.cwd(),
            ],
          },
          watch: {
            ignored: [`!**/node_modules/.histoire/**`, '**/vite.config.*'],
          },
        },
        define: {
          // We need to force this to be able to use `devtoolsRawSetupState`
          __VUE_PROD_DEVTOOLS__: 'true',
          // Disable warnings
          'process.env.NODE_ENV': JSON.stringify(isServer ? 'production' : process.env.NODE_ENV ?? 'development'),
        },
        cacheDir: isServer ? 'node_modules/.hst-vite-server' : 'node_modules/.hst-vite',
      }
    },

    async resolveId (id, importer) {
      if (id.startsWith(STORIES_ID)) {
        return RESOLVED_STORIES_ID
      }
      if (id.startsWith(SETUP_ID)) {
        if (ctx.config.setupFile) {
          return this.resolve(resolve(ctx.root, ctx.config.setupFile), importer, {
            skipSelf: true,
          })
        } else {
          return NOOP_ID
        }
      }
      if (id.startsWith(CONFIG_ID)) {
        return RESOLVED_CONFIG_ID
      }
      if (id.startsWith(THEME_ID)) {
        return RESOLVED_THEME_ID
      }
      if (id.startsWith(SEARCH_TITLE_DATA_ID)) {
        return RESOLVED_SEARCH_TITLE_DATA_ID
      }
      if (id.startsWith(SEARCH_DOCS_DATA_ID)) {
        return RESOLVED_SEARCH_DOCS_DATA_ID
      }
      if (id.startsWith(GENERATED_GLOBAL_SETUP)) {
        return RESOLVED_GENERATED_GLOBAL_SETUP
      }
      if (id.startsWith(GENERATED_SETUP_CODE)) {
        const [, index] = id.split('__')
        return `${RESOLVED_GENERATED_SETUP_CODE}__${index}`
      }
      if (id.startsWith(SUPPORT_PLUGINS_CLIENT)) {
        return RESOLVED_SUPPORT_PLUGINS_CLIENT
      }
      if (id.startsWith(SUPPORT_PLUGINS_COLLECT)) {
        return RESOLVED_SUPPORT_PLUGINS_COLLECT
      }
      if (id.startsWith(MARKDOWN_FILES)) {
        return RESOLVED_MARKDOWN_FILES
      }
      if (id.startsWith('virtual:story:')) {
        return `\0${id}`
      }
    },

    async load (id) {
      if (id === RESOLVED_STORIES_ID) {
        const resolvedStories = ctx.storyFiles.filter(s => !!s.story)
        const files = resolvedStories.map((file, index) => {
          return {
            id: file.id,
            path: file.treePath,
            filePath: file.relativePath,
            story: {
              ...file.story,
              docsText: undefined,
            },
            supportPluginId: file.supportPluginId,
            index,
          }
        })
        return `${ctx.supportPlugins.map(p => p.importStoriesPrepend).filter(Boolean).join('\n')}
${resolvedStories.map((file, index) => {
    const supportPlugin = ctx.supportPlugins.find(p => p.id === file.supportPluginId)
    if (!supportPlugin) {
      throw new Error(`Could not find support plugin for story ${file.path}: ${file.supportPluginId}`)
    }
    return supportPlugin.importStoryComponent(file, index)
  }).filter(Boolean).join('\n')}
export let files = [${files.map((file) => `{${JSON.stringify(file).slice(1, -1)}, component: Comp${file.index}}`).join(',\n')}]
export let tree = ${JSON.stringify(makeTree(ctx.config, resolvedStories))}
const handlers = []
export function onUpdate (cb) {
  handlers.push(cb)
}
if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    files = newModule.files
    tree = newModule.tree
    handlers.forEach(h => {
      h(newModule.files, newModule.tree)
      newModule.onUpdate(h)
    })
  })
}`
      }

      if (id === NOOP_ID) {
        return `export default () => {}`
      }

      if (id === RESOLVED_CONFIG_ID) {
        let js = `export const config = ${JSON.stringify(ctx.config)}\n`
        if (ctx.config.theme?.logo) {
          for (const key in ctx.config.theme.logo) {
            js += `import Logo_${key} from '${ctx.config.theme.logo[key]}'\n`
          }
        }
        js += `export const logos = {${Object.keys(ctx.config.theme?.logo ?? {}).map(key => `${key}: Logo_${key}`).join(', ')}}\n`
        return js
      }

      if (id === RESOLVED_THEME_ID) {
        let css = '*, ::before, ::after {'
        // Colors
        for (const color in ctx.config.theme?.colors ?? {}) {
          for (const key in ctx.config.theme.colors[color]) {
            css += `--_histoire-color-${color}-${key}: ${parseColor(ctx.config.theme.colors[color][key]).color.join(' ')};`
          }
        }
        css += '}'
        return css
      }

      if (id === RESOLVED_SEARCH_TITLE_DATA_ID) {
        return getSearchDataJS(await generateTitleSearchData(ctx))
      }

      if (id === RESOLVED_SEARCH_DOCS_DATA_ID) {
        return getSearchDataJS(await generateDocSearchData(ctx))
      }

      if (id === RESOLVED_GENERATED_GLOBAL_SETUP) {
        if (ctx.config.setupCode) {
          return [
            // Import
            `${ctx.config.setupCode.map((c, index) => `import * as setup_${index} from '${GENERATED_SETUP_CODE}__${index}'`).join('\n')}`,
            // List
            `const setupList = [${ctx.config.setupCode.map((c, index) => `setup_${index}`).join(', ')}]`,
            // Setups
            ...ctx.supportPlugins.map(p => p.setupFn).map(fnName => `export async function ${fnName} (payload) {
              for (const setup of setupList) {
                if (setup?.${fnName}) {
                  await setup.${fnName}(payload)
                }
              }
            }`),
          ].join('\n')
        } else {
          return ''
        }
      }

      if (id.startsWith(RESOLVED_GENERATED_SETUP_CODE)) {
        const [, index] = id.split('__')
        return ctx.config.setupCode?.[index] ?? ''
      }

      if (id === RESOLVED_SUPPORT_PLUGINS_CLIENT) {
        const plugins = ctx.supportPlugins.map(p => `'${p.id}': () => import(${JSON.stringify(require.resolve(`${p.moduleName}/client`, {
          paths: [ctx.root, import.meta.url],
        }))})`)
        return `export const clientSupportPlugins = {
          ${plugins.join(',\n  ')}
        }`
      }

      if (id === RESOLVED_SUPPORT_PLUGINS_COLLECT) {
        const plugins = ctx.supportPlugins.map(p => `'${p.id}': () => import(${JSON.stringify(require.resolve(`${p.moduleName}/collect`, {
          paths: [ctx.root, import.meta.url],
        }))})`)
        return `export const collectSupportPlugins = {
          ${plugins.join(',\n  ')}
        }`
      }

      if (id === RESOLVED_MARKDOWN_FILES) {
        const filesJs = ctx.markdownFiles.map(f => `${JSON.stringify(f.relativePath)}: () => import(${JSON.stringify(`./${f.relativePath}`)})`).join(',')
        return `import { reactive } from ${getInjectedImport('@histoire/vendors/vue')}
        export const markdownFiles = reactive({${filesJs}})
        if (import.meta.hot) {
          window.__hst_md_hmr = (newModule) => {
            markdownFiles[newModule.relativePath] = () => newModule
          }
        }`
      }

      if (id.startsWith('\0virtual:story:')) {
        const moduleId = id.replace('\0', '')
        const storyFile = ctx.storyFiles.find(f => f.moduleId === moduleId && f.virtual)
        if (storyFile) {
          return storyFile.moduleCode
        }
      }
    },

    handleHotUpdate (updateContext) {
      const story = ctx.storyFiles.find(file => file.path === updateContext.file)
      if (story) {
        notifyStoryChange(story)
      }
    },

    configureServer (server) {
      server.ws.on('histoire:mount', () => {
        notifyStoryChange()
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
  // Hide spammy vite messages
  const origConsoleLog = console.log
  console.log = (...args) => {
    if (typeof args[0] !== 'string' || !args[0].startsWith('[vite] connect')) {
      origConsoleLog(...args)
    }
  }
  </script>
  <script type="module" src="/@fs/${APP_PATH}/bundle-sandbox.js"></script>
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
    <script type="module" src="/@fs/${APP_PATH}/bundle-main.js"></script>
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

  // Markdown
  plugins.push(...await createMarkdownPlugins(ctx))

  if (ctx.mode === 'build') {
    // Add file name in build mode to have components names instead of <Anonymous>
    const include = [/\.vue$/]
    const exclude = [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]\.nuxt[\\/]/]
    plugins.push({
      name: 'histoire-file-name-plugin',
      enforce: 'post',

      transform (code, id) {
        if (exclude.some(r => r.test(id))) return
        if (include.some(r => r.test(id))) {
          const file = relative(resolvedViteConfig.root, id)
          const index = code.indexOf('export default')
          const result = `${code.substring(0, index)}_sfc_main.__file = '${file}'\n${code.substring(index)}`
          return result
        }
      },
    })
  }

  return mergeViteConfig(inlineConfig, {
    configFile: false,
    plugins,
  }) as InlineConfig
}
