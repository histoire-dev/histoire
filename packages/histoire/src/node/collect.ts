import { fileURLToPath } from 'url'
import type { ViteDevServer } from 'vite'
import { ViteNodeServer } from 'vite-node/server'
import { ViteNodeRunner } from 'vite-node/client'
import { dirname, resolve } from 'pathe'
import pc from 'picocolors'
import type { StoryFile, Story } from './types.js'
import { createDomEnv } from './dom/env.js'
import { createPath } from './tree.js'
import { HistoireConfig, TFile } from './config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface UseCollectStoriesOptions {
  server: ViteDevServer
  throws?: boolean
  config: HistoireConfig
}

export function useCollectStories (options: UseCollectStoriesOptions) {
  const { server } = options
  const { destroy: destroyDomEnv } = createDomEnv()

  const node = new ViteNodeServer(server)
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
      const file:TFile = {
        title: storyData[0].title,
        path: storyFile.path,
      }
      storyFile.treePath = createPath(options.config, file)
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
