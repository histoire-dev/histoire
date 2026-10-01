/** Test declarations, lifecycle hooks, and task callbacks registered by stories. */
export const STORY_COLLECTORS_CODE = `
/** Registers a callback on the active task after a failed test. */
export function onTestFailed(callback, timeout) {
  registerHistoireTestTaskCallback(globalThis.__vitest_worker__?.current, 'onFailed', callback, timeout)
}

/** Registers cleanup on the active task for either test outcome. */
export function onTestFinished(callback, timeout) {
  registerHistoireTestTaskCallback(globalThis.__vitest_worker__?.current, 'onFinished', callback, timeout)
}

export const describe = createHistoireSuiteCollector()

export const it = createHistoireTestCollector()

export const test = it
export const suite = describe

/** Registers suite setup with its optional deadline. */
export function beforeAll(callback, timeout) {
  registerCollectedTestHook('beforeAll', callback, timeout)
}
/** Registers per-test setup with its optional deadline. */
export function beforeEach(callback, timeout) {
  registerCollectedTestHook('beforeEach', callback, timeout)
}
/** Registers suite teardown with its optional deadline. */
export function afterAll(callback, timeout) {
  registerCollectedTestHook('afterAll', callback, timeout)
}
/** Registers per-test teardown with its optional deadline. */
export function afterEach(callback, timeout) {
  registerCollectedTestHook('afterEach', callback, timeout)
}
/** Registers a resource wrapper around a suite. */
export function aroundAll(callback, timeout) {
  registerCollectedAroundHook('aroundAll', callback, timeout)
}
/** Registers a resource wrapper around a test. */
export function aroundEach(callback, timeout) {
  registerCollectedAroundHook('aroundEach', callback, timeout)
}
`
