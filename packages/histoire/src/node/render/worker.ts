import { fileURLToPath } from 'url'
import type { MessagePort } from 'worker_threads'
import { ViteNodeRunner } from 'vite-node/client'
import { createBirpc } from 'birpc'
import type { FetchFunction, ResolveIdFunction } from 'vite-node'
import { dirname, resolve } from 'pathe'
import { createDomEnv } from '../dom/env.js'
import type { StoryFile } from '../types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface Payload {
  root: string
  base: string
  port: MessagePort
  storyFile: StoryFile
}

export interface ReturnData {
  htmlRenders: string[]
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

  // Mount app to collect stories/variants
  const { run } = await runner.executeFile(resolve(__dirname, '../../client/server-render/index.js'))

  const htmlRenders: string[] = []
  for (const variant of payload.storyFile.story.variants) {
    const { html } = await run(payload.storyFile, variant)
    htmlRenders.push(html)
  }

  destroyDomEnv()

  return {
    htmlRenders,
  }
}
