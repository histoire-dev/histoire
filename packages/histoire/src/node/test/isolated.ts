import type { HistoireProjectTestCollectionResult } from '@histoire/protocol'
import type { HistoireTestRunSummary } from '@histoire/shared'
import type { Context } from '../context.js'
import type { RunHistoireTestsOptions } from './types.js'
import { fork } from 'node:child_process'
import { HistoireSdkError, validateBridgeResult, validateProjectTestCollection, validateWireValue } from '@histoire/protocol'
import { waitForChildExit } from '../runtime/child-process.js'
import { ExecutionError } from '../runtime/execution-types.js'
import { throwIfTestAborted } from '../util/test-abort.js'
import { getRunTimeout } from '../util/test-timeouts.js'
import { captureTestContextFiles } from './context-transfer.js'

/** Existing runner executes in owned process; caller's cwd/env/handlers/exitCode never borrowed. */
export function runIsolatedHistoireTests(ctx: Context, options: RunHistoireTestsOptions): Promise<HistoireTestRunSummary> {
  return isolatedTestOperation(ctx, options, 'run') as Promise<HistoireTestRunSummary>
}

/** Collection borrows the same owned process and confirmed teardown as execution. */
export function collectIsolatedHistoireTests(ctx: Context, options: RunHistoireTestsOptions): Promise<HistoireProjectTestCollectionResult> {
  return isolatedTestOperation(ctx, options, 'collect') as Promise<HistoireProjectTestCollectionResult>
}

/** Discriminated worker operation prevents process effects from entering library caller. */
async function isolatedTestOperation(ctx: Context, options: RunHistoireTestsOptions, operation: 'run' | 'collect'): Promise<HistoireTestRunSummary | HistoireProjectTestCollectionResult> {
  throwIfTestAborted(options.signal)
  const child = fork(new URL('./worker.js', import.meta.url), [], { cwd: ctx.root, execArgv: [], serialization: 'advanced', stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  child.stdout?.pipe(process.stderr, { end: false })
  child.stderr?.pipe(process.stderr, { end: false })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  let received = false
  let cleanupConfirmed = false
  let timer: ReturnType<typeof setTimeout>
  let result: HistoireTestRunSummary | HistoireProjectTestCollectionResult | undefined
  let failure: unknown
  let failed = false
  /** Only finite cancellation travels to existing runner; never release lane here. */
  const abort = () => {
    if (child.connected) child.send({ type: 'cancel' }, () => {})
  }
  options.signal?.addEventListener('abort', abort, { once: true })
  try {
    result = await new Promise<HistoireTestRunSummary | HistoireProjectTestCollectionResult>((resolve, reject) => {
      timer = setTimeout(() => {
        abort()
        reject(new HistoireSdkError('TIMEOUT', 'Histoire test worker timed out'))
      }, getRunTimeout(ctx) + 60_000)
      child.once('error', reject)
      child.once('exit', () => {
        if (!received) reject(new HistoireSdkError('INTERNAL_ERROR', 'Test worker exited without confirmed result'))
      })
      child.on('message', (message: any) => {
        if (received || !['result', 'error'].includes(message?.type)) return
        received = true
        cleanupConfirmed = message.cleanupConfirmed === true
        try {
          validateWireValue(message, { kind: 'response', name: 'tests.run' })
          if (!cleanupConfirmed) throw new ExecutionError('CLEANUP_UNCONFIRMED', 'Test worker cleanup could not be confirmed')
          if (message.type === 'error') throw new HistoireSdkError(message.error.code, message.error.message)
          if (operation === 'collect') {
            const targets = ctx.storyFiles.filter(file => file.story && !file.story.docsOnly && (!options.storyId || file.story.id === options.storyId)).flatMap(file => file.story!.variants.map(variant => ({ storyId: file.story!.id, variantId: variant.id })))
            validateProjectTestCollection(message.collection, targets)
            resolve(message.collection)
          }
          else {
            validateBridgeResult('tests.run', message.summary)
            resolve(message.summary)
          }
        }
        catch (error) { reject(error) }
      })
      // Metadata capture prevents queued target contamination. Plugin functions
      // reload in owned child; no live server/config object crosses IPC.
      const files = options.skipStoryScan ? captureTestContextFiles(ctx) : undefined
      child.send({ type: 'run', operation, root: ctx.root, configFile: ctx.configFile, files, options: { storyId: options.storyId, variantId: options.variantId, skipStoryScan: options.skipStoryScan, maxRetries: 0, strictCleanup: true, strictTarget: true } }, (error) => {
        if (error) reject(error)
      })
      if (options.signal?.aborted) abort()
    })
    throwIfTestAborted(options.signal)
  }
  catch (error) {
    failure = error
    failed = true
  }
  finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    if (!received) abort()
    if (!await waitForChildExit(child, exited, 10_000)) {
      child.kill('SIGTERM')
      if (!await waitForChildExit(child, exited, 2_000)) {
        child.kill('SIGKILL')
        await waitForChildExit(child, exited, 2_000)
      }
      failure = new ExecutionError('CLEANUP_UNCONFIRMED', 'Test worker required termination; descendant cleanup unknown', failure)
      failed = true
    }
    else if (!cleanupConfirmed) {
      failure = new ExecutionError('CLEANUP_UNCONFIRMED', 'Test worker exited without confirmed cleanup', failure)
      failed = true
    }
  }
  if (failed) throw failure
  return result!
}
