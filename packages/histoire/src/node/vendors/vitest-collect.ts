import { registerCollectedTestCase, registerCollectedTestSuite } from '@histoire/shared'

type AnyFn = (...args: any[]) => any

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

export function describe(name: string, fn: AnyFn) {
  registerCollectedTestSuite(name, fn)
}

export function it(name: string, fn?: AnyFn) {
  registerCollectedTestCase(name, fn)
}

export const test = it

export function beforeAll() {}
export function beforeEach() {}
export function afterAll() {}
export function afterEach() {}
