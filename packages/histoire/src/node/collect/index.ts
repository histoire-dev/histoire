import type { ServerStoryFile } from '@histoire/shared'
import type {
  DevEnvironment,
  FetchModuleOptions,
  FetchResult,
  ViteDevServer,
} from 'vite'
import type { Context } from '../context.js'
import type { Payload, ReturnData } from './worker.js'
import { cpus } from 'node:os'
import { MessageChannel } from 'node:worker_threads'
import Tinypool from '@akryum/tinypool'
import { createBirpc } from 'birpc'
import { relative } from 'pathe'
import pc from 'picocolors'
import { moduleRunnerTransform } from 'vite'
import { createPath } from '../tree.js'
import { slash } from '../util/fs.js'

export interface UseCollectStoriesOptions {
  server: ViteDevServer
  mainServer?: ViteDevServer
  throws?: boolean
}

type TBuiltinRpcValue = string | {
  type: 'string'
  value: string
} | {
  type: 'RegExp'
  source: string
  flags: string
}

export type TCollectRpc = {
  fetchModule: (id: string, importer?: string, options?: FetchModuleOptions) => Promise<FetchResult>
  getBuiltins: () => Promise<TBuiltinRpcValue[]>
}

const NOOP_VITE_CLIENT_ID = '\0histoire:collect-vite-client'
const noopViteClientCode = `
export class ErrorOverlay {}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  }
}
export function injectQuery(url) {
  return url
}
export function removeStyle() {}
export function updateStyle() {}
`

export function useCollectStories(options: UseCollectStoriesOptions, ctx: Context) {
  const { server, mainServer } = options

  const maxThreads = ctx.config.collectMaxThreads ?? cpus().length

  const threadsCount = ctx.mode === 'dev'
    ? Math.max(Math.min(maxThreads, Math.floor(cpus().length / 2)), 1)
    : Math.max(Math.min(maxThreads, cpus().length - 1), 1)
  console.log(pc.blue(`Using ${threadsCount} thread${threadsCount === 1 ? '' : 's'} for story collection`))

  const threadPool = new Tinypool({
    filename: new URL('./worker.js', import.meta.url).href,
    // WebContainer compatibility (Stackblitz)
    useAtomics: typeof process.versions.webcontainer !== 'string',
    minThreads: threadsCount,
    maxThreads: threadsCount,
  })

  function clearCache() {
    server.moduleGraph.invalidateAll()
    for (const environment of Object.values(server.environments)) {
      environment.moduleGraph.invalidateAll()
    }
  }

  function createChannel() {
    const channel = new MessageChannel()
    const port = channel.port2
    const workerPort = channel.port1

    createBirpc<Record<string, never>, TCollectRpc>({
      async fetchModule(id, importer, fetchOptions) {
        if (isViteClientModule(id)) {
          return fetchNoopViteClientModule(id)
        }
        return getFetchEnvironment(id).fetchModule(id, importer, fetchOptions)
      },
      getBuiltins: async () => server.environments.ssr.config.resolve.builtins.map((builtin) => {
        if (typeof builtin === 'string') {
          return {
            type: 'string',
            value: builtin,
          }
        }
        return {
          type: 'RegExp',
          source: builtin.source,
          flags: builtin.flags,
        }
      }),
    }, {
      post: data => port.postMessage(data),
      on: data => port.on('message', data),
    })

    return {
      port,
      workerPort,
    }
  }

  if (mainServer) {
    mainServer.watcher.on('change', (file) => {
      file = slash(file)
      threadPool.broadcastMessage({
        kind: 'hst:invalidate',
        file,
      })
    })
  }

  async function executeStoryFile(storyFile: ServerStoryFile) {
    try {
      const { workerPort } = createChannel()
      const payload: Payload = {
        storyFile,
        port: workerPort,
      }
      const { storyData } = await threadPool.run(payload, {
        transferList: [
          workerPort,
        ],
      }) as ReturnData
      if (storyData.length === 0) {
        console.warn(pc.yellow(`⚠️  No story found for ${storyFile.path}`))
        return
      }
      else if (storyData.length > 1) {
        console.warn(pc.yellow(`⚠️  Multiple stories not supported: ${storyFile.path}`))
      }

      const finalData = storyData[0]

      // Default props
      if (ctx.config.defaultStoryProps) {
        for (const key in ctx.config.defaultStoryProps) {
          if (finalData[key] == null) {
            finalData[key] = ctx.config.defaultStoryProps[key]
          }
        }
      }

      if (!finalData.layout) {
        finalData.layout = { type: 'single', iframe: true }
      }

      storyFile.id = finalData.id
      storyFile.story = finalData
      storyFile.treeFile = {
        title: finalData.title,
        path: relative(server.config.root, storyFile.path),
      }
      storyFile.treePath = createPath(ctx.config, storyFile.treeFile)
      storyFile.story.title = storyFile.treePath[storyFile.treePath.length - 1]
    }
    catch (e) {
      console.error(pc.red(`Error while collecting story ${storyFile.path}:\n${formatError(e)}`))
      if (options.throws) {
        throw e
      }
    }
  }

  async function destroy() {
    await threadPool.destroy()
  }

  return {
    clearCache,
    executeStoryFile,
    destroy,
  }

  function getFetchEnvironment(id: string): DevEnvironment {
    if (isWebTransform(id)) {
      return server.environments.client
    }
    return server.environments.ssr
  }

  function isWebTransform(id: string) {
    const transformMode = ctx.config.viteNodeTransformMode
    if (transformMode?.web?.some(pattern => pattern.test(id))) {
      return true
    }
    if (transformMode?.ssr?.some(pattern => pattern.test(id))) {
      return false
    }
    return !/\.([cm]?[jt]sx?|json)$/.test(id)
  }
}

function isViteClientModule(id: string) {
  const normalizedId = id.replace(/\\/g, '/').replace(/\?.*$/, '')
  return normalizedId === '@vite/client'
    || normalizedId === '/@vite/client'
    || normalizedId.endsWith('/vite/dist/client/client.mjs')
}

async function fetchNoopViteClientModule(url: string): Promise<FetchResult> {
  const result = await moduleRunnerTransform(noopViteClientCode, null, url, noopViteClientCode)
  return {
    code: result?.code ?? '',
    file: null,
    id: NOOP_VITE_CLIENT_ID,
    url,
    invalidate: false,
  }
}

function formatError(error: unknown) {
  const e = error as Error & { frame?: string }
  return e.frame ? `${pc.bold(e.message)}\n${e.frame}` : e.stack ?? e.message ?? String(error)
}
