import type { HistoireTestRegistration } from '@histoire/shared'
import { describe, expect, it, vi } from 'vitest'
import { describe as collectDescribe, it as collectIt } from '../../vendors/vitest-collect.js'
import {
  createSessionOptions,
  runStorySetup,
  STORY_ID,
  useVariantTestSession,
  VARIANT_ID,
} from '../utils/variant-test-session.js'

describe('createVariantTestSession collection', () => {
  const runtime = useVariantTestSession()

  it('re-imports invalidated stories before collecting tests again', async () => {
    let revision = 0
    const loader = vi.fn(async () => {
      const testName = revision === 0
        ? 'renders the initial test'
        : 'renders the refreshed test'
      const registry = (globalThis as typeof globalThis & {
        __HST_TEST_REGISTRY__?: HistoireTestRegistration[]
      }).__HST_TEST_REGISTRY__

      registry?.push(({ canvas }) => {
        collectDescribe('mock suite', () => {
          collectIt(testName, () => {
            expect(canvas.textContent).toContain('cache invalidation')
          })
        })
      })

      return {
        default: {
          name: revision === 0 ? 'InitialComponent' : 'RefreshedComponent',
        },
      }
    })

    const session = runtime.createVariantTestSession(createSessionOptions({
      moduleLoaders: { [STORY_ID]: loader },
    }))

    const initialDefinitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)
    expect(initialDefinitions.map(definition => definition.name)).toEqual([
      'renders the initial test',
    ])
    expect(loader).toHaveBeenCalledTimes(1)

    revision = 1

    const cachedDefinitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)
    expect(cachedDefinitions.map(definition => definition.name)).toEqual([
      'renders the initial test',
    ])
    expect(loader).toHaveBeenCalledTimes(1)

    session.invalidateStory(STORY_ID)

    const refreshedDefinitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)
    expect(refreshedDefinitions.map(definition => definition.name)).toEqual([
      'renders the refreshed test',
    ])
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('keeps distinct loop-generated tests that share a name and handler source', async () => {
    // `items.forEach(item => it('works', () => …))` produces tests with the
    // same fullName AND identical handler source but different closures —
    // vitest runs them all, so collection must not collapse them.
    runStorySetup(runtime.mounts.renderRegistrations, () => {
      for (const item of ['a', 'b']) {
        collectDescribe('loop suite', () => {
          collectIt('works', () => {
            expect(item).toBeTruthy()
          })
        })
      }
    })

    const session = runtime.createVariantTestSession(createSessionOptions())

    const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)

    expect(definitions.filter(definition => definition.fullName === 'loop suite > works')).toHaveLength(2)
  })

  it('preserves explicit test deadlines for the generated Vitest spec', async () => {
    runStorySetup(runtime.mounts.renderRegistrations, () => {
      collectIt('deadline', () => {}, 2_000)
    })

    const definitions = await runtime.createVariantTestSession(createSessionOptions())
      .collectVariantTests(STORY_ID, VARIANT_ID)

    expect(definitions).toMatchObject([{ name: 'deadline', timeout: 2_000 }])
  })

  it('keeps same-named tests registered by several onTest calls of one story setup', async () => {
    // `for (…) onTest(…)` in a story `<script setup>`: one execution, several
    // registrations, all of them legitimate tests.
    const makeRegistration = (): HistoireTestRegistration => () => {
      collectDescribe('loop suite', () => {
        collectIt('works', () => {})
      })
    }
    runStorySetup(runtime.mounts.renderRegistrations, makeRegistration(), makeRegistration())

    const session = runtime.createVariantTestSession(createSessionOptions())

    const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)

    expect(definitions.filter(definition => definition.fullName === 'loop suite > works')).toHaveLength(2)
  })

  it('collapses re-registrations of the same tests across bootstrap and render mounts', async () => {
    // Same setup executed by two mounts: different function instances,
    // identical registrations — the panel must list each test once.
    const makeRegistration = (): HistoireTestRegistration => () => {
      collectDescribe('dupe suite', () => {
        collectIt('same test', () => {})
      })
    }
    runStorySetup(runtime.mounts.bootstrapRegistrations, makeRegistration())
    runStorySetup(runtime.mounts.renderRegistrations, makeRegistration())

    const session = runtime.createVariantTestSession(createSessionOptions())

    const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)

    expect(definitions.filter(definition => definition.fullName === 'dupe suite > same test')).toHaveLength(1)
  })

  it('collapses extra story setups that ran inside a single mount phase window', async () => {
    // The ambient test registry is process-wide, so a story mounted elsewhere in
    // the page (the preview iframe keeps a live copy of the story on screen)
    // pushes its registrations into whichever mount phase window is open. Those
    // extra executions must not be mistaken for loop-generated repeats.
    const makeRegistration = (): HistoireTestRegistration => () => {
      collectDescribe('mocked module in story setup', () => {
        collectIt('renders the mocked dependency output', () => {})
        collectIt('tracks calls through the mocked module function', () => {})
        // Handler-less definitions have a byte-identical dedupe key across
        // executions, so they are the clearest symptom of over-counting.
        collectIt.skip('fails', () => {})
      })
    }

    runStorySetup(runtime.mounts.bootstrapRegistrations, makeRegistration())
    runStorySetup(runtime.mounts.bootstrapRegistrations, makeRegistration())
    runStorySetup(runtime.mounts.bootstrapRegistrations, makeRegistration())
    runStorySetup(runtime.mounts.renderRegistrations, makeRegistration())

    const session = runtime.createVariantTestSession(createSessionOptions())

    const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)

    expect(definitions.map(definition => definition.fullName)).toEqual([
      'mocked module in story setup > renders the mocked dependency output',
      'mocked module in story setup > tracks calls through the mocked module function',
      'mocked module in story setup > fails',
    ])
    expect(definitions.map(definition => definition.id)).toEqual(['0', '1', '2'])
  })

  it('forwards the offscreen render option to the render mount', async () => {
    const { mountRenderVariant } = await import('../../virtual/variant-test-mount.js')

    await runtime.createVariantTestSession(createSessionOptions({ offscreenRenderMount: true }))
      .collectVariantTests(STORY_ID, VARIANT_ID)
    expect(vi.mocked(mountRenderVariant)).toHaveBeenLastCalledWith(
      expect.anything(),
      VARIANT_ID,
      expect.any(Function),
      { offscreen: true, timeoutMs: 30_000 },
    )

    // Defaults to a visible mount (the vitest browser harness keeps real,
    // on-screen elements so real-pointer interactions stay possible).
    await runtime.createVariantTestSession(createSessionOptions()).collectVariantTests(STORY_ID, VARIANT_ID)
    expect(vi.mocked(mountRenderVariant)).toHaveBeenLastCalledWith(
      expect.anything(),
      VARIANT_ID,
      expect.any(Function),
      { offscreen: false, timeoutMs: 30_000 },
    )
  })

  it('keeps registrations produced during bootstrap mounting', async () => {
    runStorySetup(runtime.mounts.bootstrapRegistrations, ({ canvas }) => {
      collectDescribe('bootstrap suite', () => {
        collectIt('captures bootstrap registrations', () => {
          expect(canvas.textContent).toContain('cache invalidation')
        })
      })
    })

    const session = runtime.createVariantTestSession(createSessionOptions({
      moduleLoaders: {
        [STORY_ID]: vi.fn(async () => ({ default: { name: 'BootstrapComponent' } })),
      },
    }))

    const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)

    expect(definitions.map(definition => definition.fullName)).toEqual([
      'bootstrap suite > captures bootstrap registrations',
    ])
  })

  it('unmounts both mounts of every flow, including a failing one', async () => {
    const session = runtime.createVariantTestSession(createSessionOptions())

    await session.collectVariantTests(STORY_ID, VARIANT_ID)
    // One offscreen copy of the story per mount stays in the page otherwise,
    // accumulating over a dev session of collect/run flows.
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 1, render: 1 })

    await session.runVariantTests(STORY_ID, VARIANT_ID)
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 2, render: 2 })

    await expect(session.runCollectedTest(STORY_ID, VARIANT_ID, {
      id: '404',
      name: 'missing',
      fullName: 'missing',
    })).rejects.toThrow(/Could not resolve/)
    expect(runtime.mounts.cleanups).toEqual({ bootstrap: 3, render: 3 })
  })

  it('never adopts the handler of a story copy mounted outside the session', async () => {
    // The ambient registry is process-wide: the visible preview re-rendering the
    // same story registers during the session's render window and forms its own
    // group after it. Adopting its handler would run assertions against another
    // mount's setup scope.
    const ran: string[] = []
    const makeRegistration = (mount: string): HistoireTestRegistration => () => {
      collectIt('same test', () => {
        ran.push(mount)
      })
    }

    runStorySetup(runtime.mounts.renderRegistrations, makeRegistration('session'))
    runStorySetup(runtime.mounts.foreignRegistrations, makeRegistration('foreign'))

    const session = runtime.createVariantTestSession(createSessionOptions())

    const definitions = await session.collectVariantTests(STORY_ID, VARIANT_ID)
    expect(definitions).toHaveLength(1)

    await session.runCollectedTest(STORY_ID, VARIANT_ID, definitions[0])
    expect(ran).toEqual(['session'])
  })
})
