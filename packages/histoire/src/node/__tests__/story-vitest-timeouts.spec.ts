import { describe, expect, it, vi } from 'vitest'
import { runStoryVitestTests } from './utils/story-vitest-shim.js'

describe('preview Vitest task deadlines', () => {
  it('honors explicit test deadlines', async () => {
    const summary = await runStoryVitestTests((shim) => {
      shim.it('slow body', () => new Promise(() => {}), 5)
    })

    expect(summary.tests[0].errors[0]).toMatchObject({
      message: expect.stringContaining('Test timed out in 5ms.'),
    })
  }, 1_000)

  it('includes tracked assertions in the test deadline', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const summary = await runStoryVitestTests((shim) => {
        shim.it('slow assertion', () => {
          shim.expect(new Promise(() => {})).resolves.toBe(1)
        }, 5)
      })

      expect(summary.tests[0].errors[0]).toMatchObject({
        message: expect.stringContaining('Test timed out in 5ms.'),
      })
    }
    finally {
      warn.mockRestore()
    }
  }, 1_000)

  it('rejects synchronous work that outlives its deadline', async () => {
    const summary = await runStoryVitestTests((shim) => {
      shim.it('slow synchronous body', () => {
        const start = performance.now()
        while (performance.now() - start < 20) {
          continue
        }
      }, 5)
    })

    expect(summary.tests[0].errors[0]).toMatchObject({
      message: expect.stringContaining('Test timed out in 5ms.'),
    })
  }, 1_000)

  it.each(['onTestFinished', 'onTestFailed'] as const)('honors %s deadlines', async (callbackName) => {
    const summary = await runStoryVitestTests((shim) => {
      shim.it('slow callback', () => {
        shim[callbackName](() => new Promise(() => {}), 5)
        if (callbackName === 'onTestFailed') throw new Error('body failed')
      })
    })

    expect(summary.tests[0].errors.at(-1)).toMatchObject({
      message: expect.stringContaining('Hook timed out in 5ms.'),
    })
  }, 1_000)

  it.each(['onTestFinished', 'onTestFailed'] as const)('includes tracked assertions in %s deadlines', async (callbackName) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const order: string[] = []
    try {
      const summary = await runStoryVitestTests((shim) => {
        shim.it('slow callback assertion', () => {
          shim[callbackName](() => {
            shim.expect(new Promise(resolve => setTimeout(() => {
              order.push('assertion settled')
              resolve(1)
            }, 100))).resolves.toBe(1)
          }, 5)
          if (callbackName === 'onTestFailed') throw new Error('body failed')
        })
        shim.it('next test', () => order.push('next test'))
      })

      expect(summary.tests[0].errors.at(-1)).toMatchObject({
        message: expect.stringContaining('Hook timed out in 5ms.'),
      })
      expect(summary.tests[1].state).toBe('passed')
      expect(order[0]).toBe('next test')
    }
    finally {
      warn.mockRestore()
    }
  }, 1_000)
})
