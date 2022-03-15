import { fileURLToPath } from 'url'
import type { ViteDevServer } from 'vite'
import { ViteNodeServer } from 'vite-node/server'
import { ViteNodeRunner } from 'vite-node/client'
import { dirname, resolve, relative } from 'pathe'
import pc from 'picocolors'
import type { StoryFile, Story } from './types.js'
import { createDomEnv } from './dom/env.js'
import { createPath, TreeFile } from './tree.js'
import type { Context } from './context.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface UseCollectStoriesOptions {
  server: ViteDevServer
  throws?: boolean
}

export function useCollectStories (options: UseCollectStoriesOptions, ctx: Context) {
  const { server } = options
  const { destroy: destroyDomEnv } = createDomEnv()

  const node = new ViteNodeServer(server, {
    deps: {
      inline: [
        /histoire\/dist/,
      ],
    },
  })
  const runner = new ViteNodeRunner({
    root: server.config.root,
    base: server.config.base,
    fetchModule (id) {
      // Alias
      if (id.endsWith('vue.runtime.esm-bundler.js')) {
        id = 'vue'
      }
      return node.fetchModule(id)
    },
    resolveId (id, importer) {
      return node.resolveId(id, importer)
    },
  })

  function clearCache () {
    node.fetchCache.clear()
    runner.moduleCache.clear()
  }

  async function executeStoryFile (storyFile: StoryFile) {
    try {
      // Mount app to collect stories/variants
      const el = window.document.createElement('div')
      const { run } = await runner.executeFile(resolve(__dirname, '../client/server/index.js'))
      const storyData: Story[] = []
      await run(storyFile, storyData, el)
      if (storyData.length === 0) {
        console.warn(pc.yellow(`No story found for ${storyFile.path}`))
        return
      } else if (storyData.length > 1) {
        console.warn(pc.yellow(`Multiple stories not supported: ${storyFile.path}`))
      }
      storyFile.story = storyData[0]
      const file: TreeFile = {
        title: storyData[0].title,
        path: relative(server.config.root, storyFile.path),
      }
      storyFile.treePath = createPath(ctx.config, file)
      storyFile.story.title = storyFile.treePath[storyFile.treePath.length - 1]
    } catch (e) {
      console.error(pc.red(`Error while collecting story ${storyFile.path}:\n${e.frame ? `${pc.bold(e.message)}\n${e.frame}` : e.stack}`))
      if (options.throws) {
        throw e
      }
    }
  }

  async function destroy () {
    destroyDomEnv()
  }

  return {
    clearCache,
    executeStoryFile,
    destroy,
  }
}
