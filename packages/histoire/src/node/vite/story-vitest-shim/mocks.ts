/** Story vi facade: module mocks, spies, global stubs, and polling helpers. */
export const STORY_MOCKS_CODE = `
const compilerHints = createCompilerHints({
  globalThisKey: '__vitest_mocker__',
})

const originalGlobals = new Map()

/** Vitest helpers supported in a story iframe. */
export const vi = {
  ...compilerHints,
  clearAllMocks,
  fn,
  isMockFunction,
  /** Preserves the runtime value of Vitest's type-only helper. */
  mocked(value) {
    return value
  },
  resetAllMocks,
  restoreAllMocks,
  spyOn,
  /** Evaluates a factory when no mocker transform has already hoisted it. */
  hoisted(factory) {
    return factory()
  },
  /** Replaces a global while retaining its original property descriptor. */
  stubGlobal(name, value) {
    if (!originalGlobals.has(name)) {
      originalGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    }
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
    return vi
  },
  /** Restores globals replaced through this facade. */
  unstubAllGlobals() {
    for (const [name, descriptor] of originalGlobals) {
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor)
      }
      else {
        delete globalThis[name]
      }
    }
    originalGlobals.clear()
    return vi
  },
  /** Retains compatibility with the immutable Vite browser environment. */
  stubEnv() {
    return vi
  },
  /** Completes the environment-stubbing no-op pair. */
  unstubAllEnvs() {
    return vi
  },
  /** Rejects fake timers, which the embedded runtime does not install. */
  useFakeTimers() {
    return unsupportedRuntimeFeature('vi.useFakeTimers')
  },
  /** Returns the facade because this runtime always uses real timers. */
  useRealTimers() {
    return vi
  },
  /** Rejects clock changes that require fake timers. */
  setSystemTime() {
    return unsupportedRuntimeFeature('vi.setSystemTime')
  },
  /** Rejects advancing an unavailable fake clock. */
  advanceTimersByTime() {
    return unsupportedRuntimeFeature('vi.advanceTimersByTime')
  },
  /** Rejects draining an unavailable fake clock. */
  runAllTimers() {
    return unsupportedRuntimeFeature('vi.runAllTimers')
  },
  waitFor: waitForValue,
  waitUntil: waitUntilValue,
}
`
