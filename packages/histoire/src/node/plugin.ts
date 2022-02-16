import { relative } from 'pathe'
import { defineConfig, mergeConfig, Plugin } from 'vite'
import { APP_PATH, DIST_CLIENT_PATH } from './alias.js'
import { Context } from './context.js'
import { notifyStoryChange } from './stories.js'
import { makeTree } from './tree.js'

export const STORIES_ID = '$histoire-stories'
export const RESOLVED_STORIES_ID = `/${STORIES_ID}-resolved`
export const SETUP_ID = '$histoire-setup'
export const NOOP_ID = '/$histoire-noop'

export async function createVitePlugins (ctx: Context): Promise<Plugin[]> {
  const userViteConfig = {} // @TODO

  const vuePlugin = (await import('@vitejs/plugin-vue')).default() // @TODO check if already present in vite config

  const vitePlugin: Plugin = {
    name: 'histoire-vite-plugin',

    config () {
      const baseConfig = defineConfig({
        optimizeDeps: {
          // force include vue to avoid duplicated copies when linked + optimized
          include: [
            'vue',
            '@vue/runtime-core',
          ],
        },
        server: {
          fs: {
            allow: [DIST_CLIENT_PATH, ctx.config.sourceDir, process.cwd()],
          },
        },
      })
      return userViteConfig
        ? mergeConfig(userViteConfig, baseConfig)
        : baseConfig
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
    },

    load (id) {
      if (id === RESOLVED_STORIES_ID) {
        const resolvedStories = ctx.storyFiles.filter(s => !!s.story)
        const files = resolvedStories.map((file, index) => {
          return {
            id: file.id,
            path: file.treePath,
            story: file.story,
            framework: 'vue3',
            index,
          }
        })
        return `import { defineAsyncComponent } from 'vue'
${resolvedStories.map((file, index) => `const Comp${index} = defineAsyncComponent(() => import('${file.path}'))`).join('\n')}
export let files = [${files.map((file) => `{${JSON.stringify(file).slice(1, -1)}, component: Comp${file.index}}`).join(',\n')}]
export let tree = ${JSON.stringify(makeTree(ctx.config, files))}
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
    },

    handleHotUpdate (updateContext) {
      const story = ctx.storyFiles.find(file => file.path === updateContext.file)
      if (story) {
        notifyStoryChange(story)
      }
    },

    configureServer (server) {
      server.middlewares.use((req, res, next) => {
        if (req.url!.startsWith('/__sandbox')) {
          res.statusCode = 200
          res.end(`
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
  <script type="module" src="/@fs/${APP_PATH}/sandbox.js"></script>
</body>
</html>`)
          return
        }
        next()
      })

      // serve our index.html after vite history fallback
      return () => {
        server.middlewares.use((req, res, next) => {
          if (req.url!.endsWith('.html')) {
            res.statusCode = 200
            res.end(`
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
    <script type="module" src="/@fs/${APP_PATH}/index.js"></script>
  </body>
</html>`)
            return
          }
          next()
        })
      }
    },
  }

  const plugins = [
    vitePlugin,
    vuePlugin,
  ]

  if (ctx.mode === 'build') {
    // Add file name in build mode to have components names instead of <Anonymous>
    const include = [/\.vue$/]
    const exclude = [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]\.nuxt[\\/]/]
    const fileNamePlugin: Plugin = {
      name: 'histoire-file-name-plugin',
      enforce: 'post',

      transform (code, id) {
        if (exclude.some(r => r.test(id))) return
        if (include.some(r => r.test(id))) {
          const file = relative(ctx.config.sourceDir, id)
          const index = code.indexOf('export default')
          const result = `${code.substring(0, index)}_sfc_main.__file = '${file}'\n${code.substring(index)}`
          return result
        }
      },
    }
    plugins.push(fileNamePlugin)
  }

  return plugins
}
