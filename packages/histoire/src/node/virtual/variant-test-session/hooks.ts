import type { HistoireTestCleanup, HistoireTestHookEntry, HistoireTestRuntimeContext, HistoireTestSuiteContext } from '@histoire/shared'
import { createHookTimeoutError, getHookTimeout, withTimeout } from './timeouts.js'

/** Deadlines inherited by disposers returned from setup hooks. */
const cleanupTimeouts = new WeakMap<HistoireTestCleanup, number>()

/** Remembers source-hook deadline for a cleanup Vitest runs later. */
function addCleanup(cleanups: HistoireTestCleanup[] | undefined, cleanup: HistoireTestCleanup, timeout: number) {
  if (!cleanups) return
  const timedCleanup = async () => await cleanup()
  cleanupTimeouts.set(timedCleanup, timeout)
  cleanups.push(timedCleanup)
}

/** Runs hooks while preserving first error and optionally continuing cleanup. */
export async function runHooks(
  hooks: (HistoireTestHookEntry | HistoireTestCleanup)[],
  context?: HistoireTestRuntimeContext,
  suite?: HistoireTestSuiteContext,
  currentError?: unknown,
  always = false,
  cleanups?: HistoireTestCleanup[],
) {
  let error = currentError
  for (const hook of hooks) {
    if (error && !always) {
      break
    }
    try {
      if (typeof hook === 'function') {
        const timeout = cleanupTimeouts.get(hook)
        if (timeout === undefined) {
          await hook()
        }
        else {
          await withTimeout(Promise.resolve().then(hook), timeout, () => createHookTimeoutError(timeout))
        }
        continue
      }
      const timeout = getHookTimeout(hook.timeout)
      const cleanup = await withTimeout(
        Promise.resolve().then(() => hook.handler(context ?? {}, suite)),
        timeout,
        () => createHookTimeoutError(timeout),
      )
      if (typeof cleanup === 'function') {
        addCleanup(cleanups, cleanup, timeout)
      }
    }
    catch (hookError) {
      error ??= hookError
    }
  }
  return error
}
