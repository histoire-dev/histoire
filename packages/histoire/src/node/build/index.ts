import type {
  BuildEndCallback,
  ChangeViteConfigCallback,
  PreviewStoryCallback,
} from '@histoire/shared'
import type { RollupOutput } from 'rollup'
import type { Context } from '../context.js'
import type { NodeBuildLayout } from './node/layout.js'
import type { BuildTarget } from './node/target.js'
import { performance } from 'node:perf_hooks'
import pc from 'picocolors'
import {
  createServer as createViteServer,
  mergeConfig as mergeViteConfig,
  build as viteBuild,
} from 'vite'
import { getSerializedStoryData } from '../build-serialize.js'
import { normalizeNodeBase } from '../deploy/base.js'
import { useModuleLoader } from '../load.js'
import { scanMarkdownFiles } from '../markdown.js'
import { BuildPluginApi } from '../plugin.js'
import { findAllStories } from '../stories.js'
import { hasProjectVitest } from '../util/has-vitest.js'
import { getViteConfigWithPlugins } from '../vite/index.js'
import { collectStories, renderPreviewStories } from './collect.js'
import { generateEntryHtml, generateScriptLinks } from './html.js'
import { writeNodeArtifact } from './node/artifact.js'
import { assertNodeOutputSafe, createNodeBuildLayout } from './node/layout.js'
import { publishNodeArtifact } from './node/publish.js'
import { includesEmbeddedTestRuntime, resolveBuildPlaywrightVersion } from './node/runtime-settings.js'
import { captureNodeBuildInputs, createNodeBuildSnapshot } from './node/snapshot.js'
import { resolveBuildTarget } from './node/target.js'
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

/** Deployment target override and production-entry seam owned by Node CLI assembly. */
export interface BuildOptions {
  /** Explicit CLI target takes precedence over project config. */
  target?: BuildTarget
  /** Real production entry must be supplied before Node output can be published. */
  nodeEntryFile?: string
}

/**
 * Builds collected browser assets and optionally packages a portable Node artifact.
 * Node publication waits for every plugin hook and runtime validation to finish.
 */
export async function build(ctx: Context, options: BuildOptions = {}) {
  const startTime = performance.now()
  const target = resolveBuildTarget(ctx.config, options.target)
  if (target === 'node' && !options.nodeEntryFile) throw new Error('Node deployment build requires a production runtime entry')
  if (target === 'node') normalizeNodeBase(ctx.resolvedViteConfig.base ?? '/')
  let layout: NodeBuildLayout
  let server: Awaited<ReturnType<typeof createViteServer>>
  try {
    if (target === 'node') {
      await assertNodeOutputSafe(ctx.root, ctx.config.outDir)
      layout = await createNodeBuildLayout(ctx.config.outDir)
    }
    const outputRoot = layout?.publicDir ?? ctx.config.outDir
    await findAllStories(ctx)

    await scanMarkdownFiles(ctx)

    const { viteConfig } = await getViteConfigWithPlugins(true, ctx)
    server = await createViteServer(
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

    const inputs = target === 'node' ? await captureNodeBuildInputs(ctx) : undefined
    await collectStories(ctx, server)

    const storyCount = ctx.storyFiles.reduce((sum, file) => sum + (file.story?.variants.length ? 1 : 0), 0)
    const variantCount = ctx.storyFiles.reduce((sum, file) => sum + (file.story?.variants.length ?? 0), 0)
    const emptyStoryCount = ctx.storyFiles.length - storyCount

    const buildViteConfig = await createBuildViteConfig(ctx, server, outputRoot)

    for (const cb of changeViteConfigCallbacks) {
      await cb(buildViteConfig)
    }

    let results: Awaited<ReturnType<typeof viteBuild>>
    try {
      results = await viteBuild(buildViteConfig)
    }
    finally {
      // The Vue plugin uses this collection server until the bundle completes.
      const collectServer = server
      server = undefined
      await collectServer.close()
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
    await writeFile('index.html', indexHtml, ctx, outputRoot)

    // Sandbox
    const sandboxOutput = result.output.find(o => o.name === 'bundle-sandbox' && o.type === 'chunk')
    const sandboxHtml = generateEntryHtml(sandboxOutput.fileName, styleOutput.fileName, {}, ctx)
    await writeFile('__sandbox.html', sandboxHtml, ctx, outputRoot)
    if (hasProjectVitest(ctx.root)) {
      await writeMswWorker(ctx, outputRoot)
    }

    await writeFile('histoire.json', JSON.stringify(getSerializedStoryData(ctx), null, 2), ctx, outputRoot)

    const duration = performance.now() - startTime
    if (emptyStoryCount) {
      console.warn(pc.yellow(`⚠️  ${emptyStoryCount} empty story file${emptyStoryCount === 1 ? '' : 's'}`))
    }
    console.log(pc.green(`✅ Built ${storyCount} stor${storyCount === 1 ? 'y' : 'ies'} (${variantCount} variant${variantCount === 1 ? '' : 's'}) in ${Math.round(duration / 1000 * 100) / 100}s`))

    // Render
    await renderPreviewStories(ctx, previewStoryCallbacks, outputRoot)

    for (const fn of buildEndCallbacks) {
      await fn()
    }
    if (layout) {
      const snapshot = await createNodeBuildSnapshot(ctx, inputs)
      await writeNodeArtifact({ layout, snapshot, entryFile: options.nodeEntryFile, testRuntimeIncluded: includesEmbeddedTestRuntime(result), playwrightVersion: resolveBuildPlaywrightVersion(ctx.root) })
      await publishNodeArtifact(layout)
    }
  }
  finally {
    try {
      await server?.close()
    }
    finally { await layout?.discard() }
  }
}
