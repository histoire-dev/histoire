import { registerCollectedTestCase, registerCollectedTestSuite } from '@histoire/shared'

type AnyFn = (...args: any[]) => any
type CollectSuiteFn = ((name: string, fn: AnyFn) => void) & {
  only: (name: string, fn: AnyFn) => void
  skip: (name: string, fn?: AnyFn) => void
  todo: (name: string, fn?: AnyFn) => void
}
type CollectTestFn = ((name: string, fn?: AnyFn) => void) & {
  only: (name: string, fn?: AnyFn) => void
  skip: (name: string, fn?: AnyFn) => void
  todo: (name: string, fn?: AnyFn) => void
}

function createNoopMatcher() {
  return new Proxy(() => undefined, {
    get: () => createNoopMatcher(),
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

  return new Proxy(fn, {
    apply(target, thisArg, args) {
      target.mock.calls.push(args)
      return Reflect.apply(target, thisArg, args)
    },
    get(target, prop, receiver) {
      if (prop === 'mockImplementation') {
        return (nextImplementation: AnyFn) => createMockFunction(nextImplementation)
      }
      if (prop === 'mockReturnValue') {
        return (value: unknown) => createMockFunction(() => value)
      }
      return Reflect.get(target, prop, receiver)
    },
  })
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
}

export const vitest = vi

export const expect = Object.assign(
  (() => createNoopMatcher()) as ((value?: unknown) => any),
  {
    extend() {},
    anything: () => createNoopMatcher(),
    any: () => createNoopMatcher(),
    stringContaining: () => createNoopMatcher(),
    objectContaining: () => createNoopMatcher(),
  },
)

/** Creates a Vitest-like suite collector with chain modifiers. */
function createSuiteCollector(): CollectSuiteFn {
  return Object.assign(
    (name: string, fn: AnyFn) => {
      registerCollectedTestSuite(name, fn)
    },
    {
      only(name: string, fn: AnyFn) {
        registerCollectedTestSuite(name, fn, 'only')
      },
      skip(name: string, fn?: AnyFn) {
        registerCollectedTestSuite(name, fn, 'skip')
      },
      todo(name: string, fn?: AnyFn) {
        registerCollectedTestSuite(name, fn, 'todo')
      },
    },
  )
}

/** Creates a Vitest-like test collector with chain modifiers. */
function createTestCollector(): CollectTestFn {
  return Object.assign(
    (name: string, fn?: AnyFn) => {
      registerCollectedTestCase(name, fn)
    },
    {
      only(name: string, fn?: AnyFn) {
        registerCollectedTestCase(name, fn, 'only')
      },
      skip(name: string, fn?: AnyFn) {
        registerCollectedTestCase(name, fn, 'skip')
      },
      todo(name: string, fn?: AnyFn) {
        registerCollectedTestCase(name, fn, 'todo')
      },
    },
  )
}

export const describe = createSuiteCollector()

export const it = createTestCollector()

export const test = it

export function beforeAll() {}
export function beforeEach() {}
export function afterAll() {}
export function afterEach() {}
