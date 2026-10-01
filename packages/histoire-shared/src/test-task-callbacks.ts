/** Callback stored on a Vitest-compatible task. */
type HistoireTestTaskCallback = (context: any) => unknown

const CALLBACK_TIMEOUTS_KEY = '__HST_TEST_CALLBACK_TIMEOUTS__'

/** Globals shared by duplicate Histoire bundles in one iframe. */
interface HistoireTestCallbackGlobals {
  [CALLBACK_TIMEOUTS_KEY]?: WeakMap<HistoireTestTaskCallback, number | undefined>
}

/** Reads callback deadline metadata shared across runtime bundles. */
function getCallbackTimeouts() {
  const globals = globalThis as typeof globalThis & HistoireTestCallbackGlobals
  return globals[CALLBACK_TIMEOUTS_KEY] ??= new WeakMap()
}

/**
 * Adds a task callback while retaining its individual Vitest deadline.
 * Wrapping permits same user callback to be registered more than once with
 * distinct deadlines.
 */
export function registerHistoireTestTaskCallback(
  task: any,
  key: 'onFailed' | 'onFinished',
  handler: HistoireTestTaskCallback,
  timeout?: number,
) {
  if (!task) return
  const callback = async (context: any) => await handler(context)
  getCallbackTimeouts().set(callback, timeout)
  ;(task[key] ??= []).push(callback)
}

/** Returns a task callback's explicit deadline, if it has one. */
export function getHistoireTestTaskCallbackTimeout(callback: HistoireTestTaskCallback) {
  return getCallbackTimeouts().get(callback)
}
