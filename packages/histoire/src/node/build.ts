import { join } from 'pathe'
import { build as viteBuild, createServer as createViteServer, ResolvedConfig as ViteConfig, resolveConfig as resolveViteConfig } from 'vite'
import fs from 'fs-extra'
import { lookup as lookupMime } from 'mrmime'
import pc from 'picocolors'
import { performance } from 'perf_hooks'
import { APP_PATH } from './alias.js'
import { Context } from './context.js'
import { createVitePlugins } from './vite.js'
import { findAllStories } from './stories.js'
import type { RollupOutput } from 'rollup'
import { useCollectStories } from './collect/index.js'
import { BuildPluginApi } from './plugin.js'
import { useModuleLoader } from './load.js'

const PRELOAD_MODULES = [
  'vendor',
]

const PREFETCHED_MODULES = [
  'StoryView',
  'reactivity',
  'global-components',
]

export async function build (ctx: Context) {
  const startTime = performance.now()
  await findAllStories(ctx)

  const server = await createViteServer({
    plugins: await createVitePlugins(ctx),
  })
  await server.pluginContainer.buildStart({})

  const moduleLoader = useModuleLoader({
    server,
    throws: true,
  })
  for (const plugin of ctx.config.plugins) {
    if (plugin.onBuild) {
      const api = new BuildPluginApi(ctx, plugin, moduleLoader)
      await plugin.onBuild(api)
    }
  }

  // Collect story data
  const { executeStoryFile, destroy: destroyCollectStories } = useCollectStories({
    server,
    throws: true,
  }, ctx)
  for (const storyFile of ctx.storyFiles) {
    await executeStoryFile(storyFile)
  }
  await destroyCollectStories()

  const storyCount = ctx.storyFiles.reduce((sum, file) => sum + (file.story?.variants.length ? 1 : 0), 0)
  const variantCount = ctx.storyFiles.reduce((sum, file) => sum + (file.story?.variants.length ?? 0), 0)
  const emptyStoryCount = ctx.storyFiles.length - storyCount

  const results = await viteBuild({
    plugins: await createVitePlugins(ctx),
    build: {
      rollupOptions: {
        input: [
          join(APP_PATH, 'index.js'),
          join(APP_PATH, 'sandbox.js'),
        ],
        output: {
          manualChunks (id) {
            if (!id.includes('histoire/dist/client') && id.includes('node_modules')) {
              return 'vendor'
            }
          },
        },
      },
      outDir: ctx.config.outDir,
      emptyOutDir: true,
      cssCodeSplit: false,
      minify: false,
    },
  })
  const result = Array.isArray(results) ? results[0] : results as RollupOutput

  const resolvedViteConfig = await resolveViteConfig({
    plugins: await createVitePlugins(ctx),
  }, 'build')

  const styleOutput = result.output.find(o => o.name === 'style.css' && o.type === 'asset')

  // Preload
  const preloadOutputs = result.output.filter(o => PRELOAD_MODULES.includes(o.name) && o.type === 'chunk')
  const preloadHtml = generateScriptLinks(preloadOutputs.map(o => o.fileName), 'preload', ctx, resolvedViteConfig)

  // Prefetch
  const prefetchOutputs = result.output.filter(o => PREFETCHED_MODULES.includes(o.name) && o.type === 'chunk')
  const prefetchHtml = generateScriptLinks(prefetchOutputs.map(o => o.fileName), 'prefetch', ctx, resolvedViteConfig)

  // Index
  const indexOutput = result.output.find(o => o.name === 'index' && o.type === 'chunk')
  await writeHtml(indexOutput.fileName, styleOutput.fileName, 'index.html', {
    HEAD: `${preloadHtml}${prefetchHtml}`,
  }, ctx, resolvedViteConfig)

  // Sandbox
  const sandboxOutput = result.output.find(o => o.name === 'sandbox' && o.type === 'chunk')
  await writeHtml(sandboxOutput.fileName, styleOutput.fileName, '__sandbox.html', {}, ctx, resolvedViteConfig)

  const duration = performance.now() - startTime
  if (emptyStoryCount) {
    console.warn(pc.yellow(`⚠️  ${emptyStoryCount} empty story file`))
  }
  console.log(pc.green(`✅ Built ${storyCount} stories (${variantCount} variants) in ${Math.round(duration / 1000 * 100) / 100}s`))

  await server.close()
}

async function writeHtml (jsEntryFile: string, cssEntryFile: string, htmlFileName: string, variables: { HEAD?: string }, ctx: Context, resolvedViteConfig: ViteConfig) {
  const code = `<!DOCTYPE html>
<html>
<head>
  <title>${ctx.config.theme.title}</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="">
  <link rel="stylesheet" href="${resolvedViteConfig.base}${cssEntryFile}">
  ${ctx.config.theme?.favicon ? `<link rel="icon" type="${lookupMime(ctx.config.theme.favicon)}" href="${ctx.config.theme.favicon}"/>` : ''}
  ${variables.HEAD ?? ''}
</head>
<body>
  <div id="app"></div>
  <script type="module" src="${resolvedViteConfig.base}${jsEntryFile}"></script>
</body>
</html>`
  await fs.writeFile(join(ctx.config.outDir, htmlFileName), code, 'utf8')
}

function generateScriptLinks (prefetchScripts: string[], rel: string, ctx: Context, resolvedViteConfig: ViteConfig) {
  return prefetchScripts.map(s => `<link rel="${rel}" href="${resolvedViteConfig.base}${s}" as="script" crossOrigin="anonymous">`).join('')
}
