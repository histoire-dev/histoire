import type { HistoireTestRegistration } from '@histoire/shared'
import { describe, expect, it, vi } from 'vitest'
import { it as collectIt } from '../../vendors/vitest-collect.js'
import { createSessionOptions, runStorySetup, STORY_ID, useVariantTestSession, VARIANT_ID } from '../utils/variant-test-session.js'

describe('createVariantTestSession execution and selection', () => {
  const runtime = useVariantTestSession()

  it('keeps the render mount handler when both mounts register the same test', async () => {
    // Both mounts run the story setup, so each produces its own closure over
    // that mount's scope. The collection context (`canvas`) belongs to the
    // render mount, so the surviving handler must be the render one — the
    // bootstrap mount never rendered the variant.
    const executed: string[] = []

    /**
     * Builds a registration whose test handler has identical source in both
     * mounts (only the captured mount name differs), matching what a story
     * `<script setup>` produces when it is mounted twice.
     */
    function createMountRegistration(mount: string): HistoireTestRegistration {
      return () => {
        collectIt('reads mount state', () => {
          executed.push(mount)
        })
      }
    }

    runStorySetup(runtime.mounts.bootstrapRegistrations, createMountRegistration('bootstrap'))
    runStorySetup(runtime.mounts.renderRegistrations, createMountRegistration('render'))

    const session = runtime.createVariantTestSession(createSessionOptions())

    const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

    expect(summary.passed).toBe(1)
    expect(executed).toEqual(['render'])
  })

  it('reports skipped collected tests without running their handlers', async () => {
    runStorySetup(runtime.mounts.renderRegistrations, () => {
      collectIt.skip('skips this test', () => {
        throw new Error('Skipped test should not run')
      })
    })

    const session = runtime.createVariantTestSession(createSessionOptions({
      moduleLoaders: {
        [STORY_ID]: vi.fn(async () => ({ default: { name: 'SkippedComponent' } })),
      },
    }))

    const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

    expect(summary.skipped).toBe(1)
    expect(summary.failed).toBe(0)
    expect(summary.tests[0].state).toBe('skipped')
  })

  it('runs only focused collected tests when an only modifier is present', async () => {
    const executed: string[] = []
    runStorySetup(runtime.mounts.renderRegistrations, () => {
      collectIt('unfocused test', () => {
        throw new Error('Unfocused test should not run')
      })

      collectIt.only('focused test', () => {
        executed.push('focused')
      })

      collectIt.todo('future test')
    })

    const session = runtime.createVariantTestSession(createSessionOptions({
      moduleLoaders: {
        [STORY_ID]: vi.fn(async () => ({ default: { name: 'OnlyComponent' } })),
      },
    }))

    const summary = await session.runVariantTests(STORY_ID, VARIANT_ID)

    expect(executed).toEqual(['focused'])
    expect(summary.passed).toBe(1)
    expect(summary.skipped).toBe(2)
    expect(summary.tests.map(test => test.state)).toEqual(['skipped', 'passed', 'skipped'])
  })
})
