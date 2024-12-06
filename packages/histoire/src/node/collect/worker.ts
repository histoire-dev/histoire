import type { ServerRunPayload, ServerStory, ServerStoryFile } from '@histoire/shared'
import type { MessagePort } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { parentPort } from 'node:worker_threads'
import { createBirpc } from 'birpc'
import { dirname, resolve } from 'pathe'
import pc from 'picocolors'
import { ModuleCacheMap } from 'vite-node/client'
import { ESModulesEvaluator, ModuleRunner } from 'vite/module-runner'
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

const _moduleCache = new ModuleCacheMap()
let _runner: ModuleRunner
let _rpc: ReturnType<typeof createBirpc<{
  invoke: (payload: any) => Promise<any>
}>>

// Cleanup module cache
parentPort.on('message', (message) => {
  if (message?.kind === 'hst:invalidate') {
    _moduleCache.delete(message.file) // TODO: Do we need that with the new module runner?
  }
})

export default async (payload: Payload): Promise<ReturnData> => {
  const startTime = performance.now()
  process.env.HST_COLLECT = 'true'

  _rpc = createBirpc<{
    invoke: (payload: any) => Promise<any>
  }>({}, {
        post: data => payload.port.postMessage(data),
        on: data => payload.port.on('message', data),
      })

  const runner = _runner ?? (_runner = new ModuleRunner({
    root: payload.root,
    sourcemapInterceptor: false,
    transport: {
      invoke: async (payload) => {
        return { result: await _rpc.invoke(payload) }
      },
    },
    hmr: false,
  }, new ESModulesEvaluator()))

  const { destroy: destroyDomEnv } = createDomEnv()

  const el = window.document.createElement('div')

  const beforeExecuteTime = performance.now()
  // Mount app to collect stories/variants
  const { run } = (await runner.import(resolve(__dirname, './run.js'))) as { run: (payload: ServerRunPayload) => Promise<any> }
  const afterExecuteTime = performance.now()
  const storyData: ServerStory[] = []
  await run({
    file: payload.storyFile,
    storyData,
    el,
  })
  const afterRunTime = performance.now()

  if (payload.storyFile.markdownFile) {
    const el = document.createElement('div')
    el.innerHTML = payload.storyFile.markdownFile.html
    const text = el.textContent
    storyData.forEach((s) => {
      s.docsText = text
    })
  }

  destroyDomEnv()

  const endTime = performance.now()
  console.log(pc.dim(`${payload.storyFile.relativePath} ${Math.round(endTime - startTime)}ms (setup:${Math.round(beforeExecuteTime - startTime)}ms, execute:${Math.round(afterExecuteTime - beforeExecuteTime)}ms, run:${Math.round(afterRunTime - afterExecuteTime)}ms)`))

  return {
    storyData,
  }
}
