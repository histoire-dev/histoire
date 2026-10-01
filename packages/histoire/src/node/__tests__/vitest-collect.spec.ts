import { describe, expect, it } from 'vitest'
import * as realVitest from 'vitest'
import * as collectVitest from '../vendors/vitest-collect.js'

describe('browser collection Vitest stub', () => {
  describe('module-scope helpers safe at collection time', () => {
    it('supports vi.spyOn like the dev preview shim', () => {
      // A story calling vi.spyOn in module/setup scope renders fine in the dev
      // preview (the shim provides @vitest/spy) — collection must not crash on
      // the same code with "vi.spyOn is not a function".
      const target = { greet: (name: string) => `hello ${name}` }
      const spy = collectVitest.vi.spyOn(target, 'greet') as any

      expect(typeof spy).toBe('function')
      expect(target.greet('world')).toBe('hello world')
      expect(collectVitest.vi.isMockFunction(target.greet)).toBe(true)
      expect(typeof spy.mockRestore).toBe('function')
    })

    it('executes vi.hoisted factories inline and stubs globals', () => {
      expect(collectVitest.vi.hoisted(() => 42)).toBe(42)

      collectVitest.vi.stubGlobal('__hstCollectStubTest__', 123)
      expect((globalThis as any).__hstCollectStubTest__).toBe(123)
      delete (globalThis as any).__hstCollectStubTest__

      // Timer helpers chain off `vi` so `vi.useFakeTimers().setSystemTime(…)` works.
      expect(collectVitest.vi.useFakeTimers().setSystemTime()).toBe(collectVitest.vi)
    })

    it('resolves awaited matcher chains instead of hanging forever', async () => {
      // The noop matcher proxy must not expose a `then`: awaiting
      // `expect(x).resolves.toBe(y)` unwraps thenables, and a `then` that
      // never calls its callbacks would hang collection permanently.
      await collectVitest.expect(Promise.resolve(1)).resolves.toBe(1)

      expect(typeof collectVitest.expect([]).arrayContaining).toBe('function')
      expect(collectVitest.expect.stringMatching(/x/)).toBeTruthy()
      expect(collectVitest.expect.arrayContaining([])).toBeTruthy()
      expect(collectVitest.expect.not).toBeTruthy()
    })
  })

  it('exposes every Vitest 4.1 public export without importing Vitest itself', () => {
    for (const exportName of Object.keys(realVitest)) {
      expect(collectVitest, exportName).toHaveProperty(exportName)
    }
    expect(collectVitest.Snapshots).toHaveProperty('toMatchSnapshot')
    expect(collectVitest.Snapshots).toHaveProperty('toMatchInlineSnapshot')
    expect(collectVitest.Snapshots).toHaveProperty('toMatchFileSnapshot')
  })

  describe('vi.fn() chainable mock surface', () => {
    const chainableMethods = [
      'mockResolvedValue',
      'mockRejectedValue',
      'mockReturnValueOnce',
      'mockResolvedValueOnce',
      'mockRejectedValueOnce',
      'mockImplementationOnce',
      'mockReturnThis',
      'mockName',
      'mockClear',
      'mockReset',
      'mockRestore',
    ] as const

    it.each(chainableMethods)('exposes %s as a callable that returns a callable mock', (method) => {
      const fn = collectVitest.vi.fn() as any
      expect(typeof fn[method]).toBe('function')
      // A rejected-value mock returns a rejected promise when called; swallow it
      // so the test doesn't surface an unhandled rejection.
      const result = fn[method](undefined)
      expect(typeof result).toBe('function')
      const called = result()
      if (called && typeof called.then === 'function') {
        called.catch(() => {})
      }
    })

    it('keeps chaining across implementation-setting and noop methods', () => {
      // This is the exact pattern that used to throw at collection time:
      // a module-top-level `vi.fn().mockResolvedValue(...).mockClear()`.
      expect(() => (collectVitest.vi.fn() as any).mockResolvedValue(1).mockClear()).not.toThrow()
    })

    it('mockResolvedValue produces a mock that resolves to the value', async () => {
      const fn = (collectVitest.vi.fn() as any).mockResolvedValue({ id: 1 })
      await expect(fn()).resolves.toEqual({ id: 1 })
    })

    it('mockRejectedValue produces a mock that rejects with the value', async () => {
      const fn = (collectVitest.vi.fn() as any).mockRejectedValue(new Error('boom'))
      await expect(fn()).rejects.toThrow('boom')
    })
  })
})
