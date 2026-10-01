import { describe, expect, it } from 'vitest'
import { afterAll as collectAfterAll, afterEach as collectAfterEach, aroundAll as collectAroundAll, aroundEach as collectAroundEach, beforeAll as collectBeforeAll, beforeEach as collectBeforeEach, describe as collectDescribe, it as collectIt } from '../../vendors/vitest-collect.js'
import { createSessionOptions, runStorySetup, STORY_ID, useVariantTestSession, VARIANT_ID } from '../utils/variant-test-session.js'

describe('createVariantTestSession suite lifecycle', () => {
  const runtime = useVariantTestSession()

  it('runs nested Vitest lifecycle hooks in suite order', async () => {
    const order: string[] = []
    runStorySetup(runtime.mounts.renderRegistrations, () => {
      collectBeforeAll(() => order.push('root beforeAll'))
      collectBeforeEach(() => order.push('root beforeEach'))
      collectAfterEach(() => order.push('root afterEach'))
      collectAfterAll(() => order.push('root afterAll'))

      collectDescribe('suite', () => {
        collectBeforeAll(() => order.push('suite beforeAll'))
        collectBeforeEach(() => order.push('suite beforeEach'))
        collectAfterEach(() => order.push('suite afterEach'))
        collectAfterAll(() => order.push('suite afterAll'))

        collectIt('first', () => order.push('first'))
        collectIt('second', () => order.push('second'))
      })
    })

    const session = runtime.createVariantTestSession(createSessionOptions())
    const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

    expect(summary.passed).toBe(2)
    expect(order).toEqual([
      'root beforeAll',
      'suite beforeAll',
      'root beforeEach',
      'suite beforeEach',
      'first',
      'suite afterEach',
      'root afterEach',
      'root beforeEach',
      'suite beforeEach',
      'second',
      'suite afterEach',
      'root afterEach',
      'suite afterAll',
      'root afterAll',
    ])
  })

  it('wraps suites and cases with Vitest 4.1 around hooks', async () => {
    const order: string[] = []
    runStorySetup(runtime.mounts.renderRegistrations, () => {
      collectAroundAll(async (runSuite) => {
        order.push('aroundAll setup')
        await runSuite()
        order.push('aroundAll teardown')
      })
      collectAroundEach(async (runTest) => {
        order.push('aroundEach setup')
        await runTest()
        order.push('aroundEach teardown')
      })
      collectIt('case', () => order.push('case'))
    })

    const session = runtime.createVariantTestSession(createSessionOptions())
    const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

    expect(summary.passed).toBe(1)
    expect(order).toEqual([
      'aroundAll setup',
      'aroundEach setup',
      'case',
      'aroundEach teardown',
      'aroundAll teardown',
    ])
  })

  it('does not enter child suites after a parent beforeAll fails', async () => {
    const order: string[] = []
    runStorySetup(runtime.mounts.renderRegistrations, () => {
      collectBeforeAll(() => {
        throw new Error('parent setup failed')
      })
      collectDescribe('child', () => {
        collectBeforeAll(() => order.push('child beforeAll'))
        collectAfterAll(() => order.push('child afterAll'))
        collectIt('case', () => order.push('test'))
      })
    })

    const summary = await runtime.createVariantTestSession(createSessionOptions()).runVariantTests(STORY_ID, VARIANT_ID)

    expect(summary.failed).toBe(1)
    expect(order).toEqual([])
  })

  it('does not teardown an aroundAll scope that never enters', async () => {
    const order: string[] = []
    runStorySetup(runtime.mounts.renderRegistrations, () => {
      collectAroundAll(() => {
        throw new Error('aroundAll setup failed')
      })
      collectAfterAll(() => order.push('afterAll'))
      collectIt('case', () => order.push('test'))
    })

    const summary = await runtime.createVariantTestSession(createSessionOptions()).runVariantTests(STORY_ID, VARIANT_ID)

    expect(summary.failed).toBe(1)
    expect(order).toEqual([])
  })
})
