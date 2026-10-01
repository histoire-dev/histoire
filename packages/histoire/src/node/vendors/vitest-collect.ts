/**
 * Stand-in for Vitest's public API while a story file is executed for
 * collection only.
 *
 * Story modules import `vitest` at module scope (`vi.fn()`, `expect.extend`,
 * `describe`/`it`); during collection no test ever runs, so this module only
 * has to expose a surface broad enough that none of those calls throws.
 *
 * COMPAT: mirrors the `vitest` public exports of Vitest ^4 (verified against
 * 4.1.10). A story using an API added later crashes at collection with a plain
 * `undefined is not a function` — add it here when that happens.
 */
import { createHistoireSuiteCollector, createHistoireTestCollector, registerCollectedAroundHook, registerCollectedTestHook } from '@histoire/shared'

type AnyFn = (...args: any[]) => any

function createNoopMatcher() {
  return new Proxy(() => undefined, {
    get: (_target, prop) => {
      // `await expect(x).resolves.toBe(1)` unwraps thenables: returning a noop
      // proxy for `then` would make the await call it and never settle —
      // hanging collection forever. Report "not a thenable" instead.
      if (prop === 'then') {
        return undefined
      }
      return createNoopMatcher()
    },
    apply: () => undefined,
  })
}

function createMockFunction<T extends AnyFn | undefined>(implementation?: T) {
  const fn = ((...args: any[]) => implementation?.(...args)) as AnyFn & {
    mock: { calls: any[][] }
  }
  fn.mock = {
    calls: [],
  }

  const mock = new Proxy(fn, {
    apply(target, thisArg, args) {
      target.mock.calls.push(args)
      return Reflect.apply(target, thisArg, args)
    },
    get(target, prop, receiver) {
      // Methods that set a new implementation return a fresh chainable mock.
      if (prop === 'mockImplementation' || prop === 'mockImplementationOnce') {
        return (nextImplementation: AnyFn) => createMockFunction(nextImplementation)
      }
      if (prop === 'mockReturnValue' || prop === 'mockReturnValueOnce') {
        return (value: unknown) => createMockFunction(() => value)
      }
      if (prop === 'mockResolvedValue' || prop === 'mockResolvedValueOnce') {
        return (value: unknown) => createMockFunction(async () => value)
      }
      if (prop === 'mockRejectedValue' || prop === 'mockRejectedValueOnce') {
        return (value: unknown) => createMockFunction(() => Promise.reject(value))
      }
      // `mockReturnThis` resolves to the mock itself when invoked.
      if (prop === 'mockReturnThis') {
        return () => createMockFunction(() => mock)
      }
      // Pure noop chainables (clear/reset/restore/name) return the same mock
      // so calls like `.mockResolvedValue(1).mockClear()` keep chaining.
      if (
        prop === 'mockName'
        || prop === 'mockClear'
        || prop === 'mockReset'
        || prop === 'mockRestore'
      ) {
        return () => receiver
      }
      return Reflect.get(target, prop, receiver)
    },
  })

  return mock
}

export const vi = {
  fn: createMockFunction,
  mocked<T>(value: T) {
    return value
  },
  mock() {},
  unmock() {},
  doMock() {},
  doUnmock() {},
  importActual: async <T>(path: string) => await import(/* @vite-ignore */ path) as T,
  importMock: async <T>(path: string) => await import(/* @vite-ignore */ path) as T,
  resetAllMocks() {},
  clearAllMocks() {},
  restoreAllMocks() {},
  isMockFunction(value: unknown) {
    return Boolean(value && typeof value === 'function' && 'mock' in (value as object))
  },
  // The members below keep module/setup-scope usage from crashing collection —
  // the dev preview shim supports them, so the collection facade must at least
  // not throw for the same story code (tests never RUN during collection, so
  // faithful behavior is not required).
  /** Replaces the target method with a chainable mock for collection. */
  spyOn(target: any, key: PropertyKey) {
    const original = target?.[key]
    const mock = createMockFunction(typeof original === 'function' ? original.bind(target) : undefined)
    try {
      target[key] = mock
    }
    catch {
      // Read-only targets: return the detached mock.
    }
    return mock
  },
  stubGlobal(name: PropertyKey, value: unknown) {
    ;(globalThis as any)[name] = value
    return vi
  },
  stubEnv() {
    return vi
  },
  unstubAllGlobals() {
    return vi
  },
  unstubAllEnvs() {
    return vi
  },
  useFakeTimers() {
    return vi
  },
  useRealTimers() {
    return vi
  },
  setSystemTime() {
    return vi
  },
  advanceTimersByTime() {
    return vi
  },
  runAllTimers() {
    return vi
  },
  /** Executes the factory immediately — hoisting is irrelevant at collection time. */
  hoisted<T>(factory: () => T): T {
    return factory()
  },
  waitFor: async <T>(callback: () => T | Promise<T>) => await callback(),
  waitUntil: async <T>(callback: () => T | Promise<T>) => await callback(),
}

export const vitest = vi

export const expect = Object.assign(
  (() => createNoopMatcher()) as ((value?: unknown) => any),
  {
    extend() {},
    anything: () => createNoopMatcher(),
    any: () => createNoopMatcher(),
    stringContaining: () => createNoopMatcher(),
    stringMatching: () => createNoopMatcher(),
    objectContaining: () => createNoopMatcher(),
    arrayContaining: () => createNoopMatcher(),
    closeTo: () => createNoopMatcher(),
    assertions() {},
    hasAssertions() {},
    /** `expect.soft(value)` — same noop matcher as `expect(value)`. */
    soft: (_value?: unknown) => createNoopMatcher(),
    /** `expect.poll(() => value)` — retrying matcher, noop at collection time. */
    poll: (_value?: unknown) => createNoopMatcher(),
    unreachable(message?: string) {
      throw new Error(message ?? 'expect.unreachable')
    },
    addSnapshotSerializer() {},
    addEqualityTesters() {},
    get not() {
      return createNoopMatcher()
    },
  },
)

/** Returns collection-only expect facade. */
export function createExpect() {
  return expect
}

/** Base for runner classes unavailable during story collection. */
class UnsupportedVitestRuntime {
  constructor() {
    throw new Error('Vitest runner classes are not available during Histoire story collection.')
  }
}

/** Collection placeholder for Vitest benchmark runner. */
export class BenchmarkRunner extends UnsupportedVitestRuntime {}
/** Collection placeholder for Vitest evaluated-module registry. */
export class EvaluatedModules extends UnsupportedVitestRuntime {}
/** Collection placeholder for Vitest test runner. */
export class TestRunner extends UnsupportedVitestRuntime {}

/**
 * Chai-style assertions. Every method is a noop except `fail`, which a story
 * may legitimately use to abort its own setup.
 */
export const assert = new Proxy((() => undefined) as any, {
  get(_target, prop) {
    if (prop === 'fail') {
      return (message?: string) => {
        throw new Error(message ?? 'assert.fail')
      }
    }
    return () => undefined
  },
  apply: () => undefined,
})

export const should = () => createNoopMatcher()

export const chai = {
  assert,
  expect,
  should,
}

export const expectTypeOf = () => createNoopMatcher()

/** No-op type assertion helper for browser story collection. */
export function assertType() {}

/** No-op context injection helper for browser story collection. */
export function inject() {}

export const describe = createHistoireSuiteCollector()

export const it = createHistoireTestCollector()

export const test = it

export const suite = describe

/**
 * Benchmarks are not Histoire tests: registering them like `test` would list
 * them in the Tests panel and run them as if they asserted something. They are
 * collected as nothing at all.
 */
export const bench = Object.assign(
  (_name: string, _fn?: AnyFn) => {},
  {
    only(_name: string, _fn?: AnyFn) {},
    skip(_name: string, _fn?: AnyFn) {},
    todo(_name: string, _fn?: AnyFn) {},
  },
)

/** Registers a suite-level setup hook. */
export function beforeAll(handler: AnyFn, timeout?: number) {
  registerCollectedTestHook('beforeAll', handler, timeout)
}

/** Registers a per-test setup hook. */
export function beforeEach(handler: AnyFn, timeout?: number) {
  registerCollectedTestHook('beforeEach', handler, timeout)
}

/** Registers a suite-level cleanup hook. */
export function afterAll(handler: AnyFn, timeout?: number) {
  registerCollectedTestHook('afterAll', handler, timeout)
}

/** Registers a per-test cleanup hook. */
export function afterEach(handler: AnyFn, timeout?: number) {
  registerCollectedTestHook('afterEach', handler, timeout)
}

/** Registers a Vitest 4.1 suite lifecycle wrapper. */
export function aroundAll(handler: AnyFn, timeout?: number) {
  registerCollectedAroundHook('aroundAll', handler, timeout)
}

/** Registers a Vitest 4.1 per-test lifecycle wrapper. */
export function aroundEach(handler: AnyFn, timeout?: number) {
  registerCollectedAroundHook('aroundEach', handler, timeout)
}
/** No-op failure hook for browser story collection. */
export function onTestFailed() {}
/** No-op finished hook for browser story collection. */
export function onTestFinished() {}
/** No-op artifact recorder for browser story collection. */
export function recordArtifact() {}

/**
 * Snapshot namespace placeholder. Vitest's browser runtime imports this public
 * export internally; story collection never executes snapshot operations.
 */
export const Snapshots = Object.freeze({
  /** Collection-only snapshot matcher placeholder. */
  toMatchSnapshot: () => ({ pass: true, message: () => '' }),
  /** Collection-only inline snapshot matcher placeholder. */
  toMatchInlineSnapshot: () => ({ pass: true, message: () => '' }),
  /** Collection-only file snapshot matcher placeholder. */
  toMatchFileSnapshot: () => ({ pass: true, message: () => '' }),
})
