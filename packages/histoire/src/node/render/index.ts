import { MessageChannel } from 'worker_threads'
import type { ViteDevServer } from 'vite'
import { ViteNodeServer } from 'vite-node/server'
import type { FetchFunction, ResolveIdFunction } from 'vite-node'
import pc from 'picocolors'
import Tinypool from 'tinypool'
import { createBirpc } from 'birpc'
import type { StoryFile } from '../types.js'
import type { Context } from '../context.js'
import type { Payload, ReturnData } from './worker.js'

export interface UseRenderStoriesOptions {
  server: ViteDevServer
  throws?: boolean
}

export function useRenderStories (options: UseRenderStoriesOptions, ctx: Context) {
  const { server } = options

  const node = new ViteNodeServer(server, {
    deps: {
      inline: [
        /histoire\/dist/,
      ],
    },
  })

  const threadPool = new Tinypool({
    filename: new URL('./worker.js', import.meta.url).href,
    // WebContainer compatibility (Stackblitz)
    useAtomics: typeof process.versions.webcontainer !== 'string',
  })

  function clearCache () {
    server.moduleGraph.invalidateAll()
    node.fetchCache.clear()
  }

  function createChannel () {
    const channel = new MessageChannel()
    const port = channel.port2
    const workerPort = channel.port1

    createBirpc<Record<string, never>, {
      fetchModule: FetchFunction
      resolveId: ResolveIdFunction
    }>({
      fetchModule: (id) => node.fetchModule(id),
      resolveId: (id, importer) => node.resolveId(id, importer),
    }, {
      post: data => port.postMessage(data),
      on: data => port.on('message', data),
    })

    return {
      port,
      workerPort,
    }
  }

  async function executeStoryFile (storyFile: StoryFile) {
    try {
      const { workerPort } = createChannel()
      const { htmlRenders } = await threadPool.run({
        root: server.config.root,
        base: server.config.base,
        storyFile,
        port: workerPort,
      } as Payload, {
        transferList: [
          workerPort,
        ],
      }) as ReturnData
      return {
        htmlRenders,
      }
    } catch (e) {
      console.error(pc.red(`Error while rendering story ${storyFile.path}:\n${e.frame ? `${pc.bold(e.message)}\n${e.frame}` : e.stack}`))
      if (options.throws) {
        throw e
      }
    }
  }

  async function destroy () {
    await threadPool.destroy()
  }

  return {
    clearCache,
    executeStoryFile,
    destroy,
  }
}
