import { STORY_EXPECT_SYMBOL } from '../../virtual/variant-test-session/expect-state.js'

/** Resolves through Vite so the shim and native browser runner share spies and matchers. */
export const VITEST_5_IMPORT_CODE = `
import { chai, createExpect as createNativeExpect, expect as nativeExpect, vi as nativeVi } from "vitest"
const { clearAllMocks, fn, isMockFunction, resetAllMocks, restoreAllMocks, spyOn } = nativeVi
`

/** Supplies native assertions for Histoire-owned tasks outside the Vitest runner. */
export const VITEST_5_EXPECT_CODE = `
const storyExpectKey = Symbol.for(${JSON.stringify(STORY_EXPECT_SYMBOL)})
const taskExpects = new WeakMap()

/** Retains an unawaited failure until Histoire drains the owning task's promises. */
function retainAssertion(task, pendingBefore, result) {
  const pending = task?.promises
  if (!pending || pending.length === pendingBefore) return result

  const promise = Promise.resolve(result)
  // Vitest drops its original entry at settlement. Replace it with one
  // Histoire can still drain, and observe rejections while the body is running.
  pending[pendingBefore] = promise
  void promise.catch(() => {})

  /** An explicitly handled assertion belongs to the caller. */
  function consume() {
    const index = task.promises?.indexOf(promise) ?? -1
    if (index !== -1) task.promises.splice(index, 1)
    return promise
  }

  return {
    then: (...args) => consume().then(...args),
    catch: (...args) => consume().catch(...args),
    finally: (...args) => consume().finally(...args),
    [Symbol.toStringTag]: 'Promise',
  }
}

/** Keeps runner-owned snapshot state out of embedded story assertions. */
function readAssertionMember(target, key) {
  if (Object.hasOwn(Snapshots, key)) return () => unsupportedRuntimeFeature('Snapshot assertions')
  return Reflect.get(target, key, target)
}

/** Observes v5 promise matchers that Histoire drains inside its own test deadline. */
function observePromiseAssertion(assertion) {
  const proxy = new Proxy(assertion, {
    get(target, key) {
      const member = readAssertionMember(target, key)
      if (member instanceof chai.Assertion) return proxy
      if (typeof member !== 'function') return member
      return (...args) => {
        const task = globalThis.__vitest_worker__?.current
        const pendingBefore = task?.promises?.length ?? 0
        const result = Reflect.apply(member, target, args)
        return retainAssertion(task, pendingBefore, result)
      }
    },
  })
  return proxy
}

/** Applies the promise adapter without changing synchronous assertion behavior. */
function wrapAssertion(assertion) {
  const proxy = new Proxy(assertion, {
    get(target, key) {
      const member = readAssertionMember(target, key)
      if (key === 'resolves' || key === 'rejects') return observePromiseAssertion(member)
      return member === target ? proxy : member
    },
  })
  return proxy
}

/** Applies the same binding to plain, soft, and context-local expectations. */
function wrapExpect(getExpect) {
  return new Proxy(nativeExpect, {
    apply(_target, _receiver, args) {
      return wrapAssertion(getExpect()(...args))
    },
    get(_target, key) {
      if (key === 'soft') return (...args) => wrapAssertion(getExpect().soft(...args))
      return getExpect()[key]
    },
  })
}

/** Returns native Vitest assertions whenever the runner already owns the task. */
function activeExpect() {
  const task = globalThis.__vitest_worker__?.current
  if (!task?.[storyExpectKey]) return nativeExpect
  let taskExpect = taskExpects.get(task)
  if (!taskExpect) {
    taskExpect = createNativeExpect(task)
    taskExpects.set(task, taskExpect)
  }
  return taskExpect
}

/** Creates independent counters and binds soft/async assertions to the current task. */
export function createExpect() {
  const scoped = createNativeExpect(globalThis.__vitest_worker__?.current)
  return wrapExpect(() => scoped)
}

const expect = wrapExpect(activeExpect)
globalThis[storyExpectKey] = expect
`
