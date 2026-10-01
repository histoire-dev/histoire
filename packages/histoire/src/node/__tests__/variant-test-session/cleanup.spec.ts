import { collectHistoireTests } from '@histoire/shared'
import { describe, expect, it, vi } from 'vitest'
import { afterAll, afterEach, aroundAll, aroundEach, beforeAll, beforeEach, describe as suite, it as test } from '../../vendors/vitest-collect.js'
import { runSingleDefinition } from '../../virtual/variant-test-session/run-single-definition.js'
import { runSessionTests } from '../../virtual/variant-test-session/run.js'
import { createSessionOptions, STORY_ID, VARIANT_ID } from '../utils/variant-test-session.js'

describe.each(['preview', 'cli'] as const)('%s setup disposers', (mode) => {
  /** Executes definitions through the production preview or isolated CLI lifecycle. */
  async function run(register: () => void) {
    const definitions = collectHistoireTests([register], {} as any)
    if (mode === 'cli') {
      for (const definition of definitions) await runSingleDefinition(definition, STORY_ID, VARIANT_ID)
      return
    }
    const summary = await runSessionTests({
      definitions,
      file: createSessionOptions().files[0] as any,
      cleanup() {},
    }, STORY_ID, VARIANT_ID)
    if (!summary.ok) throw new Error(summary.errors.map(error => typeof error === 'string' ? error : error.message).join('\n'))
  }

  it('awaits nested disposers after explicit teardown and before leaving wrappers', async () => {
    const order: string[] = []
    await run(() => {
      beforeAll(() => () => {
        order.push('root disposeAll')
      })
      beforeEach(() => () => {
        order.push('root disposeEach')
      })
      suite('nested', () => {
        aroundAll(async (runSuite) => {
          order.push('aroundAll setup')
          await runSuite()
          order.push('aroundAll cleanup')
        })
        aroundEach(async (runTest) => {
          order.push('aroundEach setup')
          await runTest()
          order.push('aroundEach cleanup')
        })
        beforeAll(async () => async () => {
          await Promise.resolve()
          order.push('nested disposeAll')
        })
        beforeEach(async () => async () => {
          await Promise.resolve()
          order.push('nested disposeEach')
        })
        afterEach(() => {
          order.push('afterEach')
        })
        afterAll(() => {
          order.push('afterAll')
        })
        test('case', () => {
          order.push('test')
        })
      })
    })
    expect(order).toEqual([
      'aroundAll setup',
      'aroundEach setup',
      'test',
      'afterEach',
      'nested disposeEach',
      'root disposeEach',
      'aroundEach cleanup',
      'afterAll',
      'nested disposeAll',
      'aroundAll cleanup',
      'root disposeAll',
    ])
  })

  it('cleans already acquired resources when later setup fails', async () => {
    const disposeAll = vi.fn()
    const disposeEach = vi.fn()
    const handler = vi.fn()
    await expect(run(() => {
      beforeAll(() => disposeAll)
      beforeEach(() => disposeEach)
      beforeEach(() => {
        throw new Error('setup failed')
      })
      test('case', handler)
    })).rejects.toThrow('setup failed')
    expect(handler).not.toHaveBeenCalled()
    expect(disposeEach).toHaveBeenCalledOnce()
    expect(disposeAll).toHaveBeenCalledOnce()
  })

  it('reports disposer failures and still runs remaining cleanup', async () => {
    const remaining = vi.fn()
    await expect(run(() => {
      beforeEach(() => remaining)
      beforeEach(() => () => {
        throw new Error('cleanup failed')
      })
      test('case', () => {})
    })).rejects.toThrow('cleanup failed')
    expect(remaining).toHaveBeenCalledOnce()
  })

  it('releases around hooks after the test body fails', async () => {
    const order: string[] = []
    await expect(run(() => {
      aroundAll(async (runSuite) => {
        order.push('aroundAll setup')
        await runSuite()
        order.push('aroundAll cleanup')
      })
      aroundEach(async (runTest) => {
        order.push('aroundEach setup')
        await runTest()
        order.push('aroundEach cleanup')
      })
      test('case', () => {
        throw new Error('test failed')
      })
    })).rejects.toThrow('test failed')
    expect(order).toEqual([
      'aroundAll setup',
      'aroundEach setup',
      'aroundEach cleanup',
      'aroundAll cleanup',
    ])
  })
})
