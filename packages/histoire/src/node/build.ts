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
import { BuildEndCallback, BuildPluginApi, PreviewStoryCallback } from './plugin.js'
import { useModuleLoader } from './load.js'
import { startPreview } from './preview.js'

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
  const buildEndCallbacks: BuildEndCallback[] = []
  const previewStoryCallbacks: PreviewStoryCallback[] = []
  for (const plugin of ctx.config.plugins) {
    if (plugin.onBuild) {
      const api = new BuildPluginApi(ctx, plugin, moduleLoader)
      await plugin.onBuild(api)
      buildEndCallbacks.push(...api.buildEndCallbacks)
      previewStoryCallbacks.push(...api.previewStoryCallbacks)
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
  const indexHtml = generateEntryHtml(indexOutput.fileName, styleOutput.fileName, {
    HEAD: `${preloadHtml}${prefetchHtml}`,
  }, ctx, resolvedViteConfig)
  await writeFile('index.html', indexHtml, ctx)

  // Sandbox
  const sandboxOutput = result.output.find(o => o.name === 'sandbox' && o.type === 'chunk')
  const sandboxHtml = generateEntryHtml(sandboxOutput.fileName, styleOutput.fileName, {}, ctx, resolvedViteConfig)
  await writeFile('__sandbox.html', sandboxHtml, ctx)

  const duration = performance.now() - startTime
  if (emptyStoryCount) {
    console.warn(pc.yellow(`⚠️  ${emptyStoryCount} empty story file`))
  }
  console.log(pc.green(`✅ Built ${storyCount} stories (${variantCount} variants) in ${Math.round(duration / 1000 * 100) / 100}s`))

  // Render
  if (previewStoryCallbacks.length) {
    const { baseUrl, close } = await startPreview(resolvedViteConfig, null, ctx)
    for (const storyFile of ctx.storyFiles) {
      const story = storyFile.story
      for (const variant of story.variants) {
        const query = new URLSearchParams()
        query.append('storyId', story.id)
        query.append('variantId', variant.id)
        const url = `${baseUrl}__sandbox?${query.toString()}`
        for (const fn of previewStoryCallbacks) {
          await fn({
            file: storyFile.path,
            story,
            variant,
            url,
          })
        }
      }
    }
    await close()
  }

  await server.close()

  for (const fn of buildEndCallbacks) {
    await fn()
  }
}

function generateBaseHtml (head: string, body: string, ctx: Context) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>${ctx.config.theme.title}</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="">
  ${head}
</head>
<body>
  ${body}
</body>
</html>`
}

function generateEntryHtml (jsEntryFile: string, cssEntryFile: string, variables: { HEAD?: string }, ctx: Context, resolvedViteConfig: ViteConfig) {
  return generateBaseHtml(
    `<link rel="stylesheet" href="${resolvedViteConfig.base}${cssEntryFile}">
    ${ctx.config.theme?.favicon ? `<link rel="icon" type="${lookupMime(ctx.config.theme.favicon)}" href="${ctx.config.theme.favicon}"/>` : ''}
    ${variables.HEAD ?? ''}`,
    `<div id="app"></div>
    <script type="module" src="${resolvedViteConfig.base}${jsEntryFile}"></script>`,
    ctx,
  )
}

async function writeFile (fileName: string, content: string, ctx: Context) {
  await fs.writeFile(join(ctx.config.outDir, fileName), content, 'utf8')
}

function generateScriptLinks (prefetchScripts: string[], rel: string, ctx: Context, resolvedViteConfig: ViteConfig) {
  return prefetchScripts.map(s => `<link rel="${rel}" href="${resolvedViteConfig.base}${s}" as="script" crossOrigin="anonymous">`).join('')
}
