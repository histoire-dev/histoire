import { describe, expect, it } from 'vitest'
import { createNuxtSetupContext } from '../../../../../histoire-plugin-nuxt/src/runtime/nuxt-context.js'
import { deferred } from '../utils/mcp/deferred.js'

describe('nuxt fallback setup context', () => {
  it('serializes asynchronous setup and restores context after failure before next variant', async () => {
    const initial = {}
    let current: unknown = initial
    const context = createNuxtSetupContext({ tryUse: () => current, set: (value) => {
      current = value
    }, unset: () => {
      current = undefined
    } })
    const first = deferred<void>()
    const one = {}
    const two = {}
    const seen: unknown[] = []
    const failed = context.setup(one, async () => {
      seen.push(current)
      await first.promise
      throw new Error('plugin failed')
    })
    const assertion = expect(failed).rejects.toThrow('plugin failed')
    const second = context.setup(two, async () => {
      seen.push(current)
    })
    await Promise.resolve()
    expect(seen).toEqual([one])
    first.resolve()
    await assertion
    await second
    expect(seen).toEqual([one, two])
    expect(current).toBe(initial)
  })

  it('never retains fallback across arbitrary async application callbacks', async () => {
    let current: unknown
    const context = createNuxtSetupContext({ tryUse: () => current, set: (value) => {
      current = value
    }, unset: () => {
      current = undefined
    } })
    const first = deferred<void>()
    const second = deferred<void>()
    const a = context.call({}, () => first.promise)
    const b = context.call({}, () => second.promise)
    expect(current).toBeUndefined()
    first.resolve()
    await a
    second.resolve()
    await b
    expect(current).toBeUndefined()
  })
})
