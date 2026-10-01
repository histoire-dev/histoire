import { getHistoireTestTaskCallbackTimeout } from '@histoire/shared'
import { discardTestPromises, settleTestPromises } from './task-promises.js'
import { isPreviewTestTask } from './test-task.js'
import { createHookTimeoutError, getHookTimeout, withTimeout } from './timeouts.js'

/**
 * Runs story callbacks inside Histoire's lifecycle, before it releases mounts
 * and wrapper resources. The outer Vitest runner only sees the final error;
 * clearing its callback arrays prevents a second, too-late invocation.
 */
export async function finishHistoireTestTask(task: any, initialError?: unknown) {
  const errors: unknown[] = []
  const taskErrors = task?.result ? (task.result.errors ??= []) as unknown[] : undefined
  const stagedTaskErrors = new Set<unknown>()

  /** Records failures for callbacks before the outer Vitest runner sees them. */
  function recordError(error: unknown) {
    if (error === undefined) return
    errors.push(error)
    if (taskErrors && !taskErrors.includes(error)) {
      taskErrors.push(error)
      stagedTaskErrors.add(error)
    }
    if (task?.result) task.result.state = 'fail'
  }

  /** Includes errors that Vitest's soft assertion plugin records directly. */
  function collectTaskErrors() {
    for (const error of task?.result?.errors ?? []) {
      if (!errors.includes(error)) recordError(error)
    }
  }

  /** Lets the outer runner append each returned lifecycle error exactly once. */
  function clearStagedTaskErrors() {
    // Preview summary reads this task directly. Real Vitest receives the
    // returned error and appends it itself after Histoire's callbacks finish.
    if (task?.result && taskErrors && !isPreviewTestTask(task)) {
      task.result.errors = taskErrors.filter(error => !stagedTaskErrors.has(error))
    }
  }

  /** Drains callbacks in Vitest's default LIFO order and settles their assertions. */
  async function runCallbacks(key: 'onFinished' | 'onFailed') {
    const callbacks = task?.[key] ?? []
    task[key] = undefined
    for (const callback of [...callbacks].reverse()) {
      try {
        const timeout = getHookTimeout(getHistoireTestTaskCallbackTimeout(callback))
        const pendingErrors = await withTimeout(
          Promise.resolve().then(async () => {
            await callback(task.context)
            // Chai queues soft assertion promises after the matcher returns.
            return await settleTestPromises(task)
          }),
          timeout,
          () => createHookTimeoutError(timeout),
        )
        for (const error of pendingErrors) recordError(error)
      }
      catch (error) {
        // Once the callback fails or times out, detached assertions must not
        // hold up remaining cleanup or leak unhandled rejections.
        discardTestPromises(task)
        recordError(error)
      }
    }
  }

  recordError(initialError)
  collectTaskErrors()
  if (!errors.length && task?.result) task.result.state = 'pass'
  await runCallbacks('onFinished')
  collectTaskErrors()
  if (errors.length) await runCallbacks('onFailed')
  collectTaskErrors()

  clearStagedTaskErrors()
  if (!errors.length) return
  return errors.length === 1 ? errors[0] : new AggregateError(errors, 'Histoire test lifecycle failed')
}
