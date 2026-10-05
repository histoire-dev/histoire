import type { TestContextFiles } from './context-transfer.js'
import type { RunHistoireTestsOptions } from './types.js'
import { HistoireSdkError } from '@histoire/protocol'
import { closeContext, createContext } from '../context.js'
import { hasUnconfirmedCleanup } from '../runtime/cleanup.js'
import { ExecutionError } from '../runtime/execution-types.js'
import { collectHistoireProjectTests } from './collect.js'
import { restoreTestContextFiles } from './context-transfer.js'
import { runHistoireTests } from './run.js'

const abort = new AbortController()
let started = false

/** Child owns runner's process effects; terminal result follows context and browser cleanup. */
async function run(input: { operation?: 'run' | 'collect', root: string, configFile?: string, files?: TestContextFiles, options: RunHistoireTestsOptions }) {
  let context: Awaited<ReturnType<typeof createContext>> | undefined
  let summary: unknown
  let failure: unknown
  try {
    context = await createContext({ root: input.root, configFile: input.configFile, mode: 'dev' })
    if (input.files) restoreTestContextFiles(context, input.files)
    summary = await (input.operation === 'collect' ? collectHistoireProjectTests : runHistoireTests)(context, { ...input.options, isolate: false, signal: abort.signal })
  }
  catch (error) { failure = error }
  finally {
    try {
      if (context) await closeContext(context)
    }
    catch (error) { failure = new ExecutionError('CLEANUP_UNCONFIRMED', 'Test context cleanup failed', failure ?? error) }
  }
  const code = failure instanceof HistoireSdkError ? failure.code : failure instanceof ExecutionError ? failure.code === 'CANCELLED' ? 'CANCELLED' : 'INTERNAL_ERROR' : 'COLLECTION_FAILED'
  const message = failure instanceof Error ? failure.message : 'Histoire test initialization failed'
  process.send?.(failure ? { type: 'error', cleanupConfirmed: !hasUnconfirmedCleanup(failure), error: { code, message } } : { type: 'result', cleanupConfirmed: true, ...(input.operation === 'collect' ? { collection: summary } : { summary }) }, undefined, undefined, () => {
    // Natural exit preserves owned teardown evidence; no library process.exit.
    process.disconnect?.()
  })
}

process.on('message', (message: any) => {
  if (message?.type === 'cancel') {
    abort.abort()
  }
  else if (message?.type === 'run' && !started) {
    started = true
    void run(message).catch(() => {
      process.disconnect?.()
    })
  }
})
