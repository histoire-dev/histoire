import type { ServerStoryFile } from '@histoire/shared'
import type { MessagePort } from 'node:worker_threads'
import type { ViteDevServer } from 'vite'
import type { FetchFunction, ResolveIdFunction } from 'vite-node'
import type { Context } from '../context.js'
import type { StoryCollectionOutcome } from './outcome.js'
import type { Payload, ReturnData } from './worker.js'
import { cpus } from 'node:os'
import { MessageChannel } from 'node:worker_threads'
import Tinypool from '@akryum/tinypool'
import { createBirpc } from 'birpc'
import path from 'pathe'
import pc from 'picocolors'
import { ViteNodeServer } from 'vite-node/server'
import { hashContent, readRegisteredText } from '../mcp/project/content-index.js'
import { getContextRegistry } from '../runtime/registry.js'
import { slash } from '../util/fs.js'
import { finalizeCollectedStoryFile } from './finalize.js'

export interface UseCollectStoriesOptions {
  server: ViteDevServer
  mainServer?: ViteDevServer
  throws?: boolean
}

/** Owns one project's collection workers, transforms, ports and invalidations. */
export function useCollectStories(options: UseCollectStoriesOptions, ctx: Context) {
  const { server, mainServer } = options

  const node = new ViteNodeServer(server as any, {
    deps: {
      inline: [
        /histoire\/dist/,
        /histoire\/client/,
        /@histoire\/[\w-]+\/dist/,
        /histoire-[\w-]+\/dist/,
        /@vue\/devtools-api/,
        /vuetify/,
        // @TODO temporary fix for https://github.com/histoire-dev/histoire/issues/409
        /vite\w*\/dist\/client\/(client|env).mjs/,
        ...ctx.config.viteNodeInlineDeps ?? [],
        new RegExp(path.resolve(getContextRegistry(ctx).tempDir, 'plugins').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      ],
      fallbackCJS: true,
    },
    transformMode: ctx.config.viteNodeTransformMode,
  })

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
  const ports = new Set<MessagePort>()
  let stopped = false
  let destroying: Promise<void> | undefined
  let invalidationRevision = 0
  let invalidateAll = false
  const invalidatedFiles = new Set<string>()

  /** Clears Vite transforms for this collection server only. */
  function clearCache() {
    server.moduleGraph.invalidateAll()
    node.fetchCache.clear()
  }

  /** Registers an RPC channel immediately so failure/close can release it. */
  function createChannel() {
    const channel = new MessageChannel()
    const port = channel.port2
    const workerPort = channel.port1
    ports.add(port)

    createBirpc<Record<string, never>, {
      fetchModule: FetchFunction
      resolveId: ResolveIdFunction
    }>({
      fetchModule: id => node.fetchModule(id),
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

  /** Invalidates only this pool; removed when its owning collector stops. */
  function invalidate(file: string) {
    if (!stopped) {
      file = slash(file)
      invalidationRevision++
      // Every pool worker receives its own captured revision at task admission.
      // Parent-port messages alone can be delayed by Tinypool's idle Atomics.wait.
      if (!invalidateAll) {
        invalidatedFiles.add(file)
        if (invalidatedFiles.size > 4096) {
          invalidateAll = true
          invalidatedFiles.clear()
        }
      }
      threadPool.broadcastMessage({
        kind: 'hst:invalidate',
        file,
      })
    }
  }
  mainServer?.watcher.on('change', invalidate)

  /** Executes registered source and records success without trusting stale metadata. */
  async function executeStoryFile(storyFile: ServerStoryFile): Promise<StoryCollectionOutcome> {
    let port: MessagePort | undefined
    try {
      let sourceSha256: string
      try {
        sourceSha256 = storyFile.virtual ? hashContent(storyFile.moduleCode ?? '') : (await readRegisteredText(ctx.root, storyFile.path)).sha256
      }
      catch {
        // Content availability does not change existing trusted collection
        // policy. Unavailable source is diagnosed by the catalog projector.
      }
      const channel = createChannel()
      port = channel.port
      const { workerPort } = channel
      const payload: Payload = {
        root: server.config.root,
        base: server.config.base,
        storyFile,
        port: workerPort,
        invalidation: { revision: invalidationRevision, files: [...invalidatedFiles], all: invalidateAll },
      }
      const { storyData } = await threadPool.run(payload, {
        transferList: [
          workerPort,
        ],
      }) as ReturnData
      if (storyData.length === 0) {
        console.warn(pc.yellow(`⚠️  No story found for ${storyFile.path}`))
        delete storyFile.story
        delete storyFile.treePath
        delete storyFile.treeFile
        return { status: 'empty' }
      }
      else if (storyData.length > 1) {
        console.warn(pc.yellow(`⚠️  Multiple stories not supported: ${storyFile.path}`))
      }

      // Shared with the browser collection: the two collection modes must not
      // produce different story metadata for the same story file.
      finalizeCollectedStoryFile(storyFile, ctx, storyData[0])
      return { status: 'collected', sourceSha256 }
    }
    catch (e) {
      delete storyFile.story
      delete storyFile.treePath
      delete storyFile.treeFile
      console.error(pc.red(`Error while collecting story ${storyFile.path}:\n${e.frame ? `${pc.bold(e.message)}\n${e.frame}` : e.stack}`))
      if (options.throws) {
        throw e
      }
      return { status: 'failed', error: e }
    }
    finally {
      if (port) {
        ports.delete(port)
        port.close()
      }
    }
  }

  /** Stops invalidations and releases RPC ports even when worker teardown fails. */
  function destroy() {
    if (!destroying) {
      stopped = true
      mainServer?.watcher.off('change', invalidate)
      destroying = (async () => {
        try {
          await threadPool.destroy()
        }
        finally {
          for (const port of ports) port.close()
          ports.clear()
        }
      })()
    }
    return destroying
  }

  return {
    clearCache,
    executeStoryFile,
    destroy,
  }
}
