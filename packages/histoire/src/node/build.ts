import { join } from 'pathe'
import { build as viteBuild, createServer as createViteServer } from 'vite'
import fs from 'fs-extra'
import { lookup as lookupMime } from 'mrmime'
import pc from 'picocolors'
import { performance } from 'perf_hooks'
import { APP_PATH } from './alias.js'
import { Context } from './context.js'
import { createVitePlugins } from './plugin.js'
import { findAllStories } from './stories.js'
import type { RollupOutput } from 'rollup'
import { useCollectStories } from './collect.js'

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

  // Collect story data
  const server = await createViteServer({
    plugins: await createVitePlugins(ctx),
  })
  await server.pluginContainer.buildStart({})
  const { executeStoryFile, destroy: destroyCollectStories } = useCollectStories({
    server,
    throws: true,
  }, ctx)
  for (const storyFile of ctx.storyFiles) {
    await executeStoryFile(storyFile)
  }
  await server.close()
  await destroyCollectStories()

  const storyCount = ctx.storyFiles.reduce((sum, file) => sum + (file.story?.variants.length ? 1 : 0), 0)
  const variantCount = ctx.storyFiles.reduce((sum, file) => sum + (file.story?.variants.length ?? 0), 0)
  const emptyStoryCount = ctx.storyFiles.length - storyCount

  const results = await viteBuild({
    plugins: await createVitePlugins(ctx),
    build: {
      rollupOptions: {
        input: [
          join(APP_PATH, 'index.ts'),
          join(APP_PATH, 'sandbox.ts'),
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
    },
  })
  const result = Array.isArray(results) ? results[0] : results as RollupOutput

  const styleOutput = result.output.find(o => o.name === 'style.css' && o.type === 'asset')

  // Preload
  const preloadOutputs = result.output.filter(o => PRELOAD_MODULES.includes(o.name) && o.type === 'chunk')
  const preloadHtml = generateScriptLinks(preloadOutputs.map(o => o.fileName), 'preload')

  // Prefetch
  const prefetchOutputs = result.output.filter(o => PREFETCHED_MODULES.includes(o.name) && o.type === 'chunk')
  const prefetchHtml = generateScriptLinks(prefetchOutputs.map(o => o.fileName), 'prefetch')

  // Index
  const indexOutput = result.output.find(o => o.name === 'index' && o.type === 'chunk')
  await writeHtml(indexOutput.fileName, styleOutput.fileName, 'index.html', {
    HEAD: `${preloadHtml}${prefetchHtml}`,
  }, ctx)

  // Sandbox
  const sandboxOutput = result.output.find(o => o.name === 'sandbox' && o.type === 'chunk')
  await writeHtml(sandboxOutput.fileName, styleOutput.fileName, '__sandbox.html', {}, ctx)

  const duration = performance.now() - startTime
  if (emptyStoryCount) {
    console.warn(pc.yellow(`⚠️  ${emptyStoryCount} empty story file`))
  }
  console.log(pc.green(`✅ Built ${storyCount} stories (${variantCount} variants) in ${Math.round(duration / 1000 * 100) / 100}s`))
}

async function writeHtml (jsEntryFile: string, cssEntryFile: string, htmlFileName: string, variables: { HEAD?: string }, ctx: Context) {
  const code = `<!DOCTYPE html>
<html>
<head>
  <title>${ctx.config.theme.title}</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="">
  <link rel="stylesheet" href="/${cssEntryFile}">
  ${ctx.config.theme?.favicon ? `<link rel="icon" type="${lookupMime(ctx.config.theme.favicon)}" href="${ctx.config.theme.favicon}"/>` : ''}
  ${variables.HEAD ?? ''}
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/${jsEntryFile}"></script>
</body>
</html>`
  await fs.writeFile(join(ctx.config.outDir, htmlFileName), code, 'utf8')
}

function generateScriptLinks (prefetchScripts: string[], rel: string) {
  return prefetchScripts.map(s => `<link rel="${rel}" href="${s}" as="script" crossOrigin="anonymous">`).join('')
}
