import type { PreviewStoryCallback } from '@histoire/shared'
import type { ViteDevServer } from 'vite'
import type { Context } from '../context.js'
import pc from 'picocolors'
import { useCollectStories } from '../collect/index.js'
import { startPreview } from '../preview.js'
import { hasProjectVitest } from '../util/has-vitest.js'

/**
 * Collects every story of the project.
 *
 * Two strategies: a real browser run (opt-in, needs Vitest installed) or the
 * hybrid vite-node execution. The collection server is left open in both cases:
 * `@vitejs/plugin-vue` is re-pointed at it for the whole bundle build, so the
 * caller closes it only once the build is over.
 */
export async function collectStories(ctx: Context, server: ViteDevServer) {
  const shouldUseBrowserCollection = ctx.config.test?.buildCollection === 'browser'
    && hasProjectVitest(ctx.root)

  if (ctx.config.test?.buildCollection === 'browser' && !shouldUseBrowserCollection) {
    console.warn(pc.yellow('Vitest is not installed in this project, falling back to hybrid build-time story collection.'))
  }

  if (shouldUseBrowserCollection) {
    const { collectStoriesBrowser } = await import('../story-collection/index.js')
    await collectStoriesBrowser(ctx)
    return
  }

  const { executeStoryFile, destroy: destroyCollectStories } = useCollectStories({
    server,
    throws: true,
  }, ctx)
  try {
    await Promise.all(ctx.storyFiles.map(storyFile => executeStoryFile(storyFile)))
  }
  finally { await destroyCollectStories() }
}

/**
 * Serves the built output and invokes the plugin `previewStory` callbacks once
 * per variant (screenshot plugins and the like).
 */
export async function renderPreviewStories(ctx: Context, previewStoryCallbacks: PreviewStoryCallback[], outputRoot = ctx.config.outDir) {
  if (!previewStoryCallbacks.length) {
    return
  }

  const { baseUrl, close } = await startPreview(null, ctx, outputRoot)
  try {
    for (const storyFile of ctx.storyFiles) {
      const story = storyFile.story
      if (!story) continue
      for (const variant of story.variants) {
        const query = new URLSearchParams()
        query.append('storyId', story.id)
        query.append('variantId', variant.id)
        const url = `${baseUrl}__sandbox.html?${query.toString()}`
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
  }
  finally { await close() }
}
