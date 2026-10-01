import { getVitestWorkerState } from './worker-state.js'

const DEFAULT_HOOK_TIMEOUT = 10_000
const DEFAULT_TEST_TIMEOUT = 5_000

/** Reads a per-hook deadline, falling back to Vitest's configured default. */
export function getHookTimeout(timeout?: number) {
  return timeout ?? getVitestWorkerState()?.config?.hookTimeout ?? DEFAULT_HOOK_TIMEOUT
}

/** Reads a per-test deadline, falling back to Vitest's configured default. */
export function getTestTimeout(timeout?: number) {
  return timeout ?? getVitestWorkerState()?.config?.testTimeout ?? DEFAULT_TEST_TIMEOUT
}

/** Checks whether Vitest timeout handling is disabled. */
function isTimeoutDisabled(timeout: number) {
  return timeout <= 0 || timeout === Number.POSITIVE_INFINITY
}

/** Builds Vitest's regular hook timeout error. */
export function createHookTimeoutError(timeout: number) {
  return new Error(`Hook timed out in ${timeout}ms.\nIf this is a long-running hook, pass a timeout value as the last argument or configure it globally with "hookTimeout".`)
}

/** Builds Vitest's regular test timeout error. */
export function createTestTimeoutError(timeout: number) {
  return new Error(`Test timed out in ${timeout}ms.\nIf this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".`)
}

/** Applies a deadline while still handling later rejections from abandoned work. */
export function withTimeout<T>(promise: Promise<T>, timeout: number, createError: () => Error) {
  if (isTimeoutDisabled(timeout)) {
    return promise
  }

  const start = Date.now()
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(createError())
    }, timeout)
    timer.unref?.()
    promise.then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        // A synchronous callback can block the event loop past its deadline,
        // preventing the timer from firing until after it returns.
        if (Date.now() - start >= timeout) {
          reject(createError())
        }
        else {
          resolve(value)
        }
      },
      (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
