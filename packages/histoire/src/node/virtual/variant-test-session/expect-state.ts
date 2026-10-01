const SHARED_EXPECT_KEY = Symbol.for('expect-global')

/** Reads the shared expect object installed by Vitest (or the preview shim). */
function getSharedExpect() {
  return (globalThis as Record<symbol, any>)[SHARED_EXPECT_KEY]
}

/** Selects Vitest's context-local expect when a test requested it. */
function getTaskExpect(context?: { _local?: boolean, expect?: any }) {
  return context?._local ? context.expect : getSharedExpect()
}

/**
 * Resets the global expect bookkeeping (`assertionCalls`, `expect.assertions(n)`,
 * `expect.hasAssertions()`) so they don't leak between consecutive test handlers
 * inside the same iframe runtime.
 */
export function resetSharedExpectState() {
  const sharedExpect = getSharedExpect()
  if (typeof sharedExpect?.setState !== 'function') {
    return
  }

  sharedExpect.setState({
    assertionCalls: 0,
    isExpectingAssertions: false,
    isExpectingAssertionsError: null,
    expectedAssertionsNumber: null,
    expectedAssertionsNumberErrorGen: null,
  })
}

/**
 * Mirrors Vitest's end-of-test assertion bookkeeping checks for the lightweight
 * preview expect shim.
 */
export function assertSharedExpectState(context?: { _local?: boolean, expect?: any }) {
  const taskExpect = getTaskExpect(context)
  if (typeof taskExpect?.getState !== 'function') {
    return
  }

  const state = taskExpect.getState()
  const assertionCalls = state?.assertionCalls ?? 0

  if (typeof state?.expectedAssertionsNumber === 'number'
    && assertionCalls !== state.expectedAssertionsNumber) {
    throw typeof state.expectedAssertionsNumberErrorGen === 'function'
      ? state.expectedAssertionsNumberErrorGen()
      : new Error(`expected number of assertions to be ${state.expectedAssertionsNumber}, but got ${assertionCalls}`)
  }

  if (state?.isExpectingAssertions && assertionCalls === 0) {
    throw state.isExpectingAssertionsError instanceof Error
      ? state.isExpectingAssertionsError
      : new Error('expected any number of assertion, but got none')
  }
}

/**
 * Completes Vitest's body assertion check before teardown hooks can make more
 * assertions. The real runner performs this check before `afterEach`; clearing
 * the expectation also prevents its outer generated test from checking again.
 */
export function assertAndClearSharedExpectState(context?: { _local?: boolean, expect?: any }) {
  const taskExpect = getTaskExpect(context)
  try {
    assertSharedExpectState(context)
  }
  finally {
    taskExpect?.setState?.({
      isExpectingAssertions: false,
      isExpectingAssertionsError: null,
      expectedAssertionsNumber: null,
      expectedAssertionsNumberErrorGen: null,
    })
  }
}
