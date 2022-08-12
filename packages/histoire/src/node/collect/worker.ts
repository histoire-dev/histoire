import { fileURLToPath } from 'url'
import type { MessagePort } from 'worker_threads'
import { ViteNodeRunner } from 'vite-node/client'
import { createBirpc } from 'birpc'
import type { FetchFunction, ResolveIdFunction } from 'vite-node'
import { dirname, resolve } from 'pathe'
import type { ServerStoryFile, ServerStory, ServerRunPayload } from '@histoire/shared'
import { createDomEnv } from '../dom/env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface Payload {
  root: string
  base: string
  port: MessagePort
  storyFile: ServerStoryFile
}

export interface ReturnData {
  storyData: ServerStory[]
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
      return rpc.fetchModule(id)
    },
    resolveId (id, importer) {
      return rpc.resolveId(id, importer)
    },
  })

  const { destroy: destroyDomEnv } = createDomEnv()
  if (!global.CSS.supports) {
    global.CSS.supports = () => false
  }

  const el = window.document.createElement('div')

  // Mount app to collect stories/variants
  const { run } = (await runner.executeFile(resolve(__dirname, './run.js'))) as { run: (payload: ServerRunPayload) => Promise<any> }
  const storyData: ServerStory[] = []
  await run({
    file: payload.storyFile,
    storyData,
    el,
  })

  if (payload.storyFile.markdownFile) {
    const el = document.createElement('div')
    el.innerHTML = payload.storyFile.markdownFile.html
    const text = el.textContent
    storyData.forEach(s => {
      s.docsText = text
    })
  }

  destroyDomEnv()

  return {
    storyData,
  }
}
