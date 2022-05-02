import { fileURLToPath } from 'url'
import type { MessagePort } from 'worker_threads'
import { ViteNodeRunner } from 'vite-node/client'
import { createBirpc } from 'birpc'
import type { FetchFunction, ResolveIdFunction } from 'vite-node'
import { dirname, resolve } from 'pathe'
import { createDomEnv } from '../dom/env.js'
import type { StoryFile, Story } from '../types.js'
import type { ServerRunPayload } from '../../client/server/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface Payload {
  root: string
  base: string
  port: MessagePort
  storyFile: StoryFile
}

export interface ReturnData {
  storyData: Story[]
}

export default async (payload: Payload): Promise<ReturnData> => {
  const rpc = createBirpc<{
    fetchModule: FetchFunction
    resolveId: ResolveIdFunction
  }>({}, {
    post: data => payload.port.postMessage(data),
    on: data => payload.port.on('message', data),
  })

  const runner = new ViteNodeRunner({
    root: payload.root,
    base: payload.base,
    fetchModule (id) {
      // Alias
      if (id.endsWith('vue.runtime.esm-bundler.js')) {
        id = 'vue'
      }
      return rpc.fetchModule(id)
    },
    resolveId (id, importer) {
      return rpc.resolveId(id, importer)
    },
  })

  const { destroy: destroyDomEnv } = createDomEnv()

  const el = window.document.createElement('div')

  // Mount app to collect stories/variants
  const { run } = (await runner.executeFile(resolve(__dirname, '../../client/server/index.js'))) as { run: (payload: ServerRunPayload) => Promise<any> }
  const storyData: Story[] = []
  await run({
    file: payload.storyFile,
    storyData,
    el,
  })

  destroyDomEnv()

  return {
    storyData,
  }
}
