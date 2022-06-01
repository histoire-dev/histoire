import { createRequire } from 'module'
import { relative, dirname } from 'pathe'
import {
  resolveConfig as resolveViteConfigInternal,
  Plugin as VitePlugin,
  UserConfig as ViteConfig,
  ResolvedConfig,
  InlineConfig,
  mergeConfig as mergeViteConfig,
} from 'vite'
import { lookup as lookupMime } from 'mrmime'
import { APP_PATH, DIST_PATH, TEMP_PATH } from './alias.js'
import { Context } from './context.js'
import { notifyStoryChange } from './stories.js'
import { makeTree } from './tree.js'
import { parseColor } from './colors.js'
import { createMarkdownRenderer } from './markdown.js'
import { getSearchDataJS, generateDocSearchData, generateTitleSearchData } from './search.js'

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
  return viteConfig
}

export async function getViteConfigWithPlugins (server: boolean, ctx: Context): Promise<InlineConfig> {
  const resolvedViteConfig = await resolveViteConfig(ctx)

  const inlineConfig = await mergeHistoireViteConfig({}, ctx)
  const plugins: VitePlugin[] = []

  plugins.push({
    name: 'histoire-vite-plugin',

    config () {
      return {
        optimizeDeps: {
          disabled: server,
          entries: [
            `${APP_PATH}/bundle-main.js`,
            `${APP_PATH}/bundle-sandbox.js`,
            `${APP_PATH}/server/index.js`,
          ],
          include: [
            'vue',
            dirname(require.resolve('@vue/runtime-core/package.json')),
            dirname(require.resolve('shiki/package.json')),
            dirname(require.resolve('vscode-textmate/package.json')),
            dirname(require.resolve('vscode-oniguruma/package.json')),
            dirname(require.resolve('case/package.json')),
          ],
          exclude: [
            'histoire',
          ],
        },
        server: {
          fs: {
            allow: [DIST_PATH, TEMP_PATH, resolvedViteConfig.root, process.cwd()],
          },
        },
        define: {
          // We need to force this to be able to use `devtoolsRawSetupState`
          __VUE_PROD_DEVTOOLS__: 'true',
        },
      }
    },

    async resolveId (id, importer) {
      if (id.startsWith(STORIES_ID)) {
        return RESOLVED_STORIES_ID
      }
      if (id.startsWith(SETUP_ID)) {
        if (ctx.config.setupFile) {
          return this.resolve(ctx.config.setupFile, importer, {
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
    },

    async load (id) {
      if (id === RESOLVED_STORIES_ID) {
        const resolvedStories = ctx.storyFiles.filter(s => !!s.story)
        const files = resolvedStories.map((file, index) => {
          return {
            id: file.id,
            path: file.treePath,
            story: {
              ...file.story,
              docsText: undefined,
            },
            framework: 'vue3',
            index,
          }
        })
        return `import { defineAsyncComponent } from 'vue'
${resolvedStories.map((file, index) => `const Comp${index} = defineAsyncComponent(() => import('${file.path}'))`).join('\n')}
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
            res.end(html)
            return
          }
          next()
        })
      }
    },
  })

  // Custom blocks
  plugins.push(...await createCustomBlocksPlugins(ctx))

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
    plugins,
  }) as InlineConfig
}

async function createCustomBlocksPlugins (ctx) {
  const plugins: VitePlugin[] = []

  let md = await createMarkdownRenderer()
  if (ctx.config.markdown) {
    const result = await ctx.config.markdown(md)
    if (result) {
      md = result
    }
  }
  plugins.push({
    name: 'histoire-vue-docs-block',
    transform (code, id) {
      if (!id.includes('?vue&type=docs')) return
      if (!id.includes('lang.md')) return
      const html = md.render(code)
      return `export default Comp => {
        Comp.doc = ${JSON.stringify(html)}
      }`
    },
  })

  return plugins
}
