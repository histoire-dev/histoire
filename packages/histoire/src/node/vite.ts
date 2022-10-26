import { createRequire } from 'node:module'
import { relative, resolve, join, dirname } from 'pathe'
import {
  Plugin as VitePlugin,
  UserConfig as ViteConfig,
  InlineConfig,
  mergeConfig as mergeViteConfig,
  loadConfigFromFile as loadViteConfigFromFile,
} from 'vite'
import { lookup as lookupMime } from 'mrmime'
import fs from 'fs-extra'
import ViteInspect from 'vite-plugin-inspect'
import { APP_PATH, TEMP_PATH } from './alias.js'
import { Context } from './context.js'
import { notifyStoryChange } from './stories.js'
import { makeTree } from './tree.js'
import { parseColor } from './colors.js'
import { createMarkdownPlugins } from './markdown.js'
import { getSearchDataJS, generateDocSearchData, generateTitleSearchData } from './search.js'
import { getInjectedImport } from './util/vendors.js'

const require = createRequire(import.meta.url)

// @TODO wait for virtual modules HMR to work in vite to use `virtual:` and `\0` prefix
// https://github.com/vitejs/vite/pull/10313
export const STORIES_ID = 'virtual:$histoire-stories'
export const RESOLVED_STORIES_ID = `/__resolved__${STORIES_ID}`
// export const RESOLVED_STORIES_ID = `\0${STORIES_ID}`
export const SETUP_ID = 'virtual:$histoire-setup'
export const NOOP_ID = 'virtual:$histoire-noop'
export const CONFIG_ID = 'virtual:$histoire-config'
export const RESOLVED_CONFIG_ID = `/__resolved__${CONFIG_ID}`
// export const RESOLVED_CONFIG_ID = `\0${CONFIG_ID}`
export const THEME_ID = 'virtual:$histoire-theme'
export const RESOLVED_THEME_ID = `/__resolved__${THEME_ID}.css`
// export const RESOLVED_THEME_ID = `\0${THEME_ID}.css`
export const SEARCH_TITLE_DATA_ID = 'virtual:$histoire-search-title-data'
export const RESOLVED_SEARCH_TITLE_DATA_ID = `/__resolved__${SEARCH_TITLE_DATA_ID}`
// export const RESOLVED_SEARCH_TITLE_DATA_ID = `\0${SEARCH_TITLE_DATA_ID}`
export const SEARCH_DOCS_DATA_ID = 'virtual:$histoire-search-docs-data'
export const RESOLVED_SEARCH_DOCS_DATA_ID = `/__resolved__${SEARCH_DOCS_DATA_ID}`
// export const RESOLVED_SEARCH_DOCS_DATA_ID = `\0${SEARCH_DOCS_DATA_ID}`
export const GENERATED_GLOBAL_SETUP = 'virtual:$histoire-generated-global-setup'
export const RESOLVED_GENERATED_GLOBAL_SETUP = `/__resolved__${GENERATED_GLOBAL_SETUP}`
// export const RESOLVED_GENERATED_GLOBAL_SETUP = `\0${GENERATED_GLOBAL_SETUP}`
export const GENERATED_SETUP_CODE = 'virtual:$histoire-generated-setup-code'
export const RESOLVED_GENERATED_SETUP_CODE = `/__resolved__${GENERATED_SETUP_CODE}`
// export const RESOLVED_GENERATED_SETUP_CODE = `\0${GENERATED_SETUP_CODE}`
export const SUPPORT_PLUGINS_CLIENT = 'virtual:$histoire-support-plugins-client'
export const RESOLVED_SUPPORT_PLUGINS_CLIENT = `/__resolved__${SUPPORT_PLUGINS_CLIENT}`
// export const RESOLVED_SUPPORT_PLUGINS_CLIENT = `\0${SUPPORT_PLUGINS_CLIENT}`
export const SUPPORT_PLUGINS_COLLECT = 'virtual:$histoire-support-plugins-collect'
export const RESOLVED_SUPPORT_PLUGINS_COLLECT = `/__resolved__${SUPPORT_PLUGINS_COLLECT}`
// export const RESOLVED_SUPPORT_PLUGINS_COLLECT = `\0${SUPPORT_PLUGINS_COLLECT}`
export const MARKDOWN_FILES = 'virtual:$histoire-markdown-files'
export const RESOLVED_MARKDOWN_FILES = `/__resolved__${MARKDOWN_FILES}`
// export const RESOLVED_MARKDOWN_FILES = `\0${MARKDOWN_FILES}`

const ID_SEPARATOR = '__-__'

const PLUGINS_HAVE_DEV = [
  '@histoire/plugin-vue',
]

export async function mergeHistoireViteConfig (viteConfig: InlineConfig, ctx: Context) {
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
  const userViteConfigFile = await loadViteConfigFromFile({ command: ctx.mode === 'dev' ? 'serve' : 'build', mode: ctx.mode })
  const userViteConfig = mergeViteConfig(userViteConfigFile?.config ?? {}, { server: { port: 6006 } })

  const inlineConfig = await mergeHistoireViteConfig(userViteConfig, ctx)
  const plugins: VitePlugin[] = []

  function optimizeDeps (deps: string[]): string[] {
    const result = []
    for (const dep of deps) {
      result.push(dep)
      try {
        result.push(dirname(require.resolve(`${dep}/package.json`)))
      } catch (e) {
        // Noop
      }
    }
    return result
  }

  plugins.push(ViteInspect())

  plugins.push({
    name: 'histoire-vite-plugin',

    config () {
      return {
        resolve: {
          dedupe: [
            'vue',
          ],
          alias: {
            'histoire-style': join(APP_PATH, process.env.HISTOIRE_DEV ? 'app/style/main.pcss' : 'style.css'),
          },
        },
        optimizeDeps: {
          entries: [
            `${APP_PATH}/bundle-main.js`,
            `${APP_PATH}/bundle-sandbox.js`,
          ],
          include: optimizeDeps([
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
              ctx.resolvedViteConfig.root,
              process.cwd(),
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
        },
        define: {
          // We need to force this to be able to use `devtoolsRawSetupState`
          __VUE_PROD_DEVTOOLS__: 'true',
          // Disable warnings
          'process.env.NODE_ENV': JSON.stringify(isServer ? 'production' : process.env.NODE_ENV ?? 'development'),
          // Collect flag
          'process.env.HST_COLLECT': 'false',
        },
        cacheDir: isServer ? 'node_modules/.hst-vite-server' : 'node_modules/.hst-vite',
      }
    },

    async resolveId (id, importer) {
      if (id.startsWith(STORIES_ID)) {
        return RESOLVED_STORIES_ID
      }
      if (id.startsWith(SETUP_ID)) {
        const setupFileConfig = ctx.config.setupFile
        if (setupFileConfig) {
          let file: string
          if (typeof setupFileConfig === 'string') {
            file = setupFileConfig
          } else if (isServer && 'server' in setupFileConfig) {
            file = setupFileConfig.server
          } else if ('browser' in setupFileConfig) {
            file = setupFileConfig.browser
          }
          if (file) {
            return this.resolve(resolve(ctx.root, file), importer, {
              skipSelf: true,
            })
          }
        }
        return NOOP_ID
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
        const [, index] = id.split(ID_SEPARATOR)
        return `${RESOLVED_GENERATED_SETUP_CODE}${ID_SEPARATOR}${index}`
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
      if (id.startsWith('virtual:story-source:')) {
        return `/__resolved__${id}`
        // @TODO
        // return `\0${id}`
      }

      if (id.startsWith('virtual:md:')) {
        return `/__resolved__${id}`
        // @TODO
        // return `\0${id}`
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
export let files = [${files.map((file) => `{${JSON.stringify(file).slice(1, -1)}, component: Comp${file.index}, source: () => import('virtual:story-source:${file.story.id}')}`).join(',\n')}]
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
            `${ctx.config.setupCode.map((c, index) => `import * as setup_${index} from '${GENERATED_SETUP_CODE}${ID_SEPARATOR}${index}'`).join('\n')}`,
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
        const [, index] = id.split(ID_SEPARATOR)
        return ctx.config.setupCode?.[index] ?? ''
      }

      if (id === RESOLVED_SUPPORT_PLUGINS_CLIENT) {
        const plugins = ctx.supportPlugins.map(p => `'${p.id}': () => import(${JSON.stringify(require.resolve(`${p.moduleName}/client${process.env.HISTOIRE_DEV && PLUGINS_HAVE_DEV.includes(p.moduleName) ? '-dev' : ''}`, {
          paths: [ctx.root, import.meta.url],
        }))})`)
        return `export const clientSupportPlugins = {
          ${plugins.join(',\n  ')}
        }`
      }

      if (id === RESOLVED_SUPPORT_PLUGINS_COLLECT) {
        const plugins = ctx.supportPlugins.map(p => `'${p.id}': () => import(${JSON.stringify(require.resolve(`${p.moduleName}/collect${process.env.HISTOIRE_DEV && PLUGINS_HAVE_DEV.includes(p.moduleName) ? '-dev' : ''}`, {
          paths: [ctx.root, import.meta.url],
        }))})`)
        return `export const collectSupportPlugins = {
          ${plugins.join(',\n  ')}
        }`
      }

      if (id === RESOLVED_MARKDOWN_FILES) {
        const filesJs = ctx.markdownFiles.map(f => `${JSON.stringify(f.relativePath)}: () => import(${JSON.stringify(`virtual:md:${f.id}`)})`).join(',')
        return `import { reactive } from ${process.env.HISTOIRE_DEV ? `'vue'` : getInjectedImport('@histoire/vendors/vue')}
        export const markdownFiles = reactive({${filesJs}})
        if (import.meta.hot) {
          if (!window.__hst_md_hmr) {
            window.__hst_md_hmr = (newModule) => {
              markdownFiles[newModule.relativePath] = () => newModule
            }
          }

          import.meta.hot.accept(newModule => {
            Object.assign(markdownFiles, newModule.markdownFiles)
          })
        }`
      }

      if (id.startsWith('\0virtual:story:')) {
        const moduleId = id.replace('\0', '')
        const storyFile = ctx.storyFiles.find(f => f.moduleId === moduleId && f.virtual)
        if (storyFile) {
          return storyFile.moduleCode
        }
      }

      if (id.startsWith('/__resolved__virtual:story-source:')) {
        const storyId = id.slice('/__resolved__virtual:story-source:'.length)
        const storyFile = ctx.storyFiles.find(f => f.story?.id === storyId)
        if (storyFile) {
          let source: string
          if (storyFile.virtual) {
            source = storyFile.moduleCode
          } else {
            source = await fs.readFile(resolve(ctx.root, storyFile.relativePath), 'utf-8')
          }
          return `export default ${JSON.stringify(source)}`
        }
      }

      if (id.startsWith('/__resolved__virtual:md:')) {
        const fileId = id.slice('/__resolved__virtual:md:'.length)
        const file = ctx.markdownFiles.find(f => f.id === fileId)
        if (!file) {
          throw new Error(`Markdown file not found: ${fileId}`)
        }
        const { html, frontmatter, relativePath } = file
        return `export const html = ${JSON.stringify(html)}
export const frontmatter = ${JSON.stringify(frontmatter)}
export const relativePath = ${JSON.stringify(relativePath)}

if (import.meta.hot) {
  import.meta.hot.accept(newModule => {
    if (newModule) {
      window.__hst_md_hmr(newModule)
    }
  })
}`
      }
    },

    handleHotUpdate (updateContext) {
      const story = ctx.storyFiles.find(file => file.path === updateContext.file)
      if (story) {
        notifyStoryChange(story)
      }
    },

    configureServer (server) {
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
      config () {
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

  return mergeViteConfig(inlineConfig, {
    configFile: false,
    plugins,
  }) as InlineConfig
}
