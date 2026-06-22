import type { ServerRunPayload, ServerStory, ServerStoryFile } from '@histoire/shared'
import type { MessagePort } from 'node:worker_threads'
import type { HotPayload } from 'vite'
import type { ModuleRunnerTransport } from 'vite/module-runner'
import type { TCollectRpc } from './index.js'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { parentPort } from 'node:worker_threads'
import { createBirpc } from 'birpc'
import { dirname, resolve } from 'pathe'
import pc from 'picocolors'
import { EvaluatedModules, ModuleRunner } from 'vite/module-runner'
import { createDomEnv } from '../dom/env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface Payload {
  port: MessagePort
  storyFile: ServerStoryFile
}

export interface ReturnData {
  storyData: ServerStory[]
}

const _evaluatedModules = new EvaluatedModules()
let _runner: ModuleRunner
let _rpc: ReturnType<typeof createBirpc<TCollectRpc>>

// Cleanup module cache
parentPort!.on('message', (message) => {
  if (message?.kind === 'hst:invalidate') {
    const modules = _evaluatedModules.getModulesByFile(message.file)
    if (modules) {
      for (const module of modules) {
        _evaluatedModules.invalidateModule(module)
      }
    }
    else {
      _evaluatedModules.clear()
    }
  }
})

export default async (payload: Payload): Promise<ReturnData> => {
  const startTime = performance.now()
  process.env.HST_COLLECT = 'true'

  _rpc = createBirpc<TCollectRpc>({}, {
    post: data => payload.port.postMessage(data),
    on: data => payload.port.on('message', data),
  })

  const runner = _runner ?? (_runner = new ModuleRunner({
    transport: createRunnerTransport(),
    evaluatedModules: _evaluatedModules,
    hmr: false,
  }))

  const { destroy: destroyDomEnv } = createDomEnv()

  const el = window.document.createElement('div')

  const beforeExecuteTime = performance.now()
  // Mount app to collect stories/variants
  const { run } = (await runner.import(resolve(__dirname, './run.js'))) as { run: (payload: ServerRunPayload) => Promise<any> }
  const storyModule = await runner.import(payload.storyFile.moduleId) as Record<string, any>
  const afterExecuteTime = performance.now()
  const storyData: ServerStory[] = []
  await run({
    file: payload.storyFile,
    storyModule,
    storyData,
    el,
  })
  const afterRunTime = performance.now()

  if (payload.storyFile.markdownFile) {
    const el = document.createElement('div')
    el.innerHTML = payload.storyFile.markdownFile.html ?? ''
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

function createRunnerTransport(): ModuleRunnerTransport {
  return {
    async invoke(payload: HotPayload) {
      try {
        if (payload.type !== 'custom' || payload.event !== 'vite:invoke') {
          throw new Error(`Unsupported runner payload: ${payload.type}`)
        }

        const { name, data } = payload.data
        if (name === 'fetchModule') {
          const args = data as Parameters<TCollectRpc['fetchModule']>
          return {
            result: await _rpc.fetchModule(...args),
          }
        }
        if (name === 'getBuiltins') {
          return {
            result: await _rpc.getBuiltins(),
          }
        }
        throw new Error(`Unsupported runner method: ${name}`)
      }
      catch (error) {
        return {
          error,
        }
      }
    },
  }
}
