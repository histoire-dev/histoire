import { fileURLToPath } from 'url'
import type { ViteDevServer } from 'vite'
import { ViteNodeServer } from 'vite-node/server'
import { ViteNodeRunner } from 'vite-node/client'
import { dirname, resolve } from 'pathe'
import type { StoryFile, Story } from './types.js'
import { createDomEnv } from './dom/env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function useCollectStories (server: ViteDevServer) {
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
    // Mount app to collect stories/variants
    const el = window.document.createElement('div')
    const { run } = await runner.executeFile(resolve(__dirname, '../client/server/index.js'))
    const storyData: Story[] = []
    await run(storyFile, storyData, el)
    if (storyData.length === 0) {
      console.warn(`No story found for ${storyFile.path}`)
      return
    } else if (storyData.length > 1) {
      console.warn(`Multiple stories not supported: ${storyFile.path}`)
    }
    storyFile.story = storyData[0]
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
