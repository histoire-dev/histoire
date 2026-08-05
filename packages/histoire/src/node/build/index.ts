import type {
  BuildEndCallback,
  ChangeViteConfigCallback,
  PreviewStoryCallback,
} from '@histoire/shared'
import type { RollupOutput } from 'rollup'
import type { Context } from '../context.js'
import { performance } from 'node:perf_hooks'
import pc from 'picocolors'
import {
  createServer as createViteServer,
  mergeConfig as mergeViteConfig,
  build as viteBuild,
} from 'vite'
import { getSerializedStoryData } from '../build-serialize.js'
import { useModuleLoader } from '../load.js'
import { scanMarkdownFiles } from '../markdown.js'
import { BuildPluginApi } from '../plugin.js'
import { findAllStories } from '../stories.js'
import { hasProjectVitest } from '../util/has-vitest.js'
import { getViteConfigWithPlugins } from '../vite/index.js'
import { collectStories, renderPreviewStories } from './collect.js'
import { generateEntryHtml, generateScriptLinks } from './html.js'
import { writeFile, writeMswWorker } from './output.js'
import { createBuildViteConfig } from './vite-config.js'

const PRELOAD_MODULES = [
  'vendor',
]

const PREFETCHED_MODULES = [
  'StoryView',
  'reactivity',
  'global-components',
]

/**
 * Builds the static Histoire site: scans and collects the stories, bundles the
 * app, then writes the entry documents and the serialized story data.
 */
export async function build(ctx: Context) {
  const startTime = performance.now()
  await findAllStories(ctx)

  await scanMarkdownFiles(ctx)

  const { viteConfig } = await getViteConfigWithPlugins(true, ctx)
  const server = await createViteServer(
    mergeViteConfig(viteConfig, {
      optimizeDeps: { include: [], noDiscovery: true },
    }),
  )
  await server.pluginContainer.buildStart({})

  const moduleLoader = useModuleLoader({
    server,
    throws: true,
  })
  const changeViteConfigCallbacks: ChangeViteConfigCallback[] = []
  const buildEndCallbacks: BuildEndCallback[] = []
  const previewStoryCallbacks: PreviewStoryCallback[] = []
  for (const plugin of ctx.config.plugins) {
    if (plugin.onBuild) {
      const api = new BuildPluginApi(ctx, plugin, moduleLoader)
      await plugin.onBuild(api)
      changeViteConfigCallbacks.push(...api.changeViteConfigCallbacks)
      buildEndCallbacks.push(...api.buildEndCallbacks)
      previewStoryCallbacks.push(...api.previewStoryCallbacks)
    }
  }

  await collectStories(ctx, server)

  const storyCount = ctx.storyFiles.reduce((sum, file) => sum + (file.story?.variants.length ? 1 : 0), 0)
  const variantCount = ctx.storyFiles.reduce((sum, file) => sum + (file.story?.variants.length ?? 0), 0)
  const emptyStoryCount = ctx.storyFiles.length - storyCount

  const buildViteConfig = await createBuildViteConfig(ctx, server)

  for (const cb of changeViteConfigCallbacks) {
    await cb(buildViteConfig)
  }

  let results: Awaited<ReturnType<typeof viteBuild>>
  try {
    results = await viteBuild(buildViteConfig)
  }
  finally {
    // Only now: `@vitejs/plugin-vue` is pointed at this server for the whole
    // build, so closing it any earlier hands the plugin a dead server.
    await server.close()
  }
  const result = Array.isArray(results) ? results[0] : results as RollupOutput

  const styleOutput = result.output.find(o => o.name === 'style.css' && o.type === 'asset')

  // Preload
  const preloadOutputs = result.output.filter(o => PRELOAD_MODULES.includes(o.name) && o.type === 'chunk')
  const preloadHtml = generateScriptLinks(preloadOutputs.map(o => o.fileName), 'preload', ctx)

  // Prefetch
  const prefetchOutputs = result.output.filter(o => PREFETCHED_MODULES.includes(o.name) && o.type === 'chunk')
  const prefetchHtml = generateScriptLinks(prefetchOutputs.map(o => o.fileName), 'prefetch', ctx)

  // Index
  const indexOutput = result.output.find(o => o.name === 'bundle-main' && o.type === 'chunk')
  const indexHtml = generateEntryHtml(indexOutput.fileName, styleOutput.fileName, {
    HEAD: `${preloadHtml}${prefetchHtml}`,
  }, ctx)
  await writeFile('index.html', indexHtml, ctx)

  // Sandbox
  const sandboxOutput = result.output.find(o => o.name === 'bundle-sandbox' && o.type === 'chunk')
  const sandboxHtml = generateEntryHtml(sandboxOutput.fileName, styleOutput.fileName, {}, ctx)
  await writeFile('__sandbox.html', sandboxHtml, ctx)
  if (hasProjectVitest(ctx.root)) {
    await writeMswWorker(ctx)
  }

  await writeFile('histoire.json', JSON.stringify(getSerializedStoryData(ctx), null, 2), ctx)

  const duration = performance.now() - startTime
  if (emptyStoryCount) {
    console.warn(pc.yellow(`⚠️  ${emptyStoryCount} empty story file${emptyStoryCount === 1 ? '' : 's'}`))
  }
  console.log(pc.green(`✅ Built ${storyCount} stor${storyCount === 1 ? 'y' : 'ies'} (${variantCount} variant${variantCount === 1 ? '' : 's'}) in ${Math.round(duration / 1000 * 100) / 100}s`))

  // Render
  await renderPreviewStories(ctx, previewStoryCallbacks)

  for (const fn of buildEndCallbacks) {
    await fn()
  }
}
