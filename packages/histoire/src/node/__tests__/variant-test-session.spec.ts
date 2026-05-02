import type { HistoireTestRegistration } from '@histoire/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { describe as collectDescribe, it as collectIt } from '../vendors/vitest-collect.js'

describe('createVariantTestSession', () => {
  let createVariantTestSession: typeof import('../virtual/variant-test-session.js').createVariantTestSession
  let bootstrapRegistrations: HistoireTestRegistration[]
  let renderRegistrations: HistoireTestRegistration[]

  beforeEach(async () => {
    vi.resetModules()
    bootstrapRegistrations = []
    renderRegistrations = []

    vi.doMock('../virtual/variant-test-mount.js', () => ({
      /**
       * Skips the actual DOM mounting path so the cache invalidation test can
       * focus on story module re-imports.
       */
      bootstrapVariant: vi.fn(async (_file: any, _variantId: string, withRegistry: any) => {
        await withRegistry(bootstrapRegistrations, false, () => {})

        return {
          registrations: bootstrapRegistrations,
          cleanup() {},
        }
      }),
      mountRenderVariant: vi.fn(async (file: any, variantId: string, withRegistry: any) => {
        await withRegistry(renderRegistrations, true, () => {})

        return {
          story: file.story,
          variant: file.story.variants.find((item: any) => item.id === variantId),
          canvas: {
            textContent: 'Mocked by Vitest for cache invalidation',
          },
          registrations: renderRegistrations,
          cleanup() {},
        }
      }),
    }))

    ;({ createVariantTestSession } = await import('../virtual/variant-test-session.js'))
  })

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

    const session = createVariantTestSession({
      files: [{
        id: 'story-id',
        path: ['Story'],
        filePath: 'src/components/Example.story.vue',
        supportPluginId: 'vue3',
        moduleId: '/src/components/Example.story.vue',
        story: {
          id: 'story-id',
          title: 'Example',
          layout: {
            type: 'single',
          },
          variants: [{
            id: 'variant-id',
            title: 'Default',
          }],
        } as any,
      }],
      moduleLoaders: {
        'story-id': loader,
      },
      runWithDynamicImport(importLoader) {
        return importLoader()
      },
    })

    const initialDefinitions = await session.collectVariantTests('story-id', 'variant-id')
    expect(initialDefinitions.map(definition => definition.name)).toEqual([
      'renders the initial test',
    ])
    expect(loader).toHaveBeenCalledTimes(1)

    revision = 1

    const cachedDefinitions = await session.collectVariantTests('story-id', 'variant-id')
    expect(cachedDefinitions.map(definition => definition.name)).toEqual([
      'renders the initial test',
    ])
    expect(loader).toHaveBeenCalledTimes(1)

    session.invalidateStory('story-id')

    const refreshedDefinitions = await session.collectVariantTests('story-id', 'variant-id')
    expect(refreshedDefinitions.map(definition => definition.name)).toEqual([
      'renders the refreshed test',
    ])
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('keeps registrations produced during bootstrap mounting', async () => {
    bootstrapRegistrations.push(({ canvas }) => {
      collectDescribe('bootstrap suite', () => {
        collectIt('captures bootstrap registrations', () => {
          expect(canvas.textContent).toContain('cache invalidation')
        })
      })
    })

    const session = createVariantTestSession({
      files: [{
        id: 'story-id',
        path: ['Story'],
        filePath: 'src/components/Example.story.vue',
        supportPluginId: 'vue3',
        moduleId: '/src/components/Example.story.vue',
        story: {
          id: 'story-id',
          title: 'Example',
          layout: {
            type: 'single',
          },
          variants: [{
            id: 'variant-id',
            title: 'Default',
          }],
        } as any,
      }],
      moduleLoaders: {
        'story-id': vi.fn(async () => ({
          default: {
            name: 'BootstrapComponent',
          },
        })),
      },
      runWithDynamicImport(importLoader) {
        return importLoader()
      },
    })

    const definitions = await session.collectVariantTests('story-id', 'variant-id')

    expect(definitions.map(definition => definition.fullName)).toEqual([
      'bootstrap suite > captures bootstrap registrations',
    ])
  })

  it('deduplicates equivalent registrations emitted by bootstrap and render mounts', async () => {
    /**
     * Creates a fresh registration to simulate Vue story setup running once per
     * mount while keeping the registered tests semantically identical.
     */
    function createDuplicateRegistration(): HistoireTestRegistration {
      return ({ canvas }) => {
        collectDescribe('duplicate suite', () => {
          collectIt('renders only once', () => {
            expect(canvas.textContent).toContain('cache invalidation')
          })
        })
      }
    }

    bootstrapRegistrations.push(createDuplicateRegistration())
    renderRegistrations.push(createDuplicateRegistration())

    const session = createVariantTestSession({
      files: [{
        id: 'story-id',
        path: ['Story'],
        filePath: 'src/components/Example.story.vue',
        supportPluginId: 'vue3',
        moduleId: '/src/components/Example.story.vue',
        story: {
          id: 'story-id',
          title: 'Example',
          layout: {
            type: 'single',
          },
          variants: [{
            id: 'variant-id',
            title: 'Default',
          }],
        } as any,
      }],
      moduleLoaders: {
        'story-id': vi.fn(async () => ({
          default: {
            name: 'DuplicateComponent',
          },
        })),
      },
      runWithDynamicImport(importLoader) {
        return importLoader()
      },
    })

    const definitions = await session.collectVariantTests('story-id', 'variant-id')

    expect(definitions.map(definition => definition.fullName)).toEqual([
      'duplicate suite > renders only once',
    ])
  })

  it('resets shared expect state between consecutive test handlers', async () => {
    const expectKey = Symbol.for('expect-global')
    const sharedExpectState = {
      assertionCalls: 0,
      isExpectingAssertions: false,
      isExpectingAssertionsError: null as Error | null,
      expectedAssertionsNumber: null as number | null,
      expectedAssertionsNumberErrorGen: null as (() => Error) | null,
    }
    const fakeExpect = {
      setState: vi.fn((state: Partial<typeof sharedExpectState>) => {
        Object.assign(sharedExpectState, state)
      }),
      getState: () => sharedExpectState,
    }
    const previousExpect = (globalThis as any)[expectKey]
    ;(globalThis as any)[expectKey] = fakeExpect

    try {
      const observedAssertionCalls: number[] = []
      renderRegistrations.push(({ canvas }) => {
        collectIt('first test', () => {
          observedAssertionCalls.push(sharedExpectState.assertionCalls)
          // Simulate the user calling `expect(value)` which would bump the counter.
          sharedExpectState.assertionCalls += 5
          expect(canvas.textContent).toContain('cache invalidation')
        })

        collectIt('second test', () => {
          observedAssertionCalls.push(sharedExpectState.assertionCalls)
          expect(canvas.textContent).toContain('cache invalidation')
        })
      })

      const session = createVariantTestSession({
        files: [{
          id: 'story-id',
          path: ['Story'],
          filePath: 'src/components/Example.story.vue',
          supportPluginId: 'vue3',
          moduleId: '/src/components/Example.story.vue',
          story: {
            id: 'story-id',
            title: 'Example',
            layout: { type: 'single' },
            variants: [{
              id: 'variant-id',
              title: 'Default',
            }],
          } as any,
        }],
        moduleLoaders: {
          'story-id': vi.fn(async () => ({
            default: { name: 'ExpectStateComponent' },
          })),
        },
        runWithDynamicImport(importLoader) {
          return importLoader()
        },
      })

      const summary = await session.runVariantTests('story-id', 'variant-id')

      expect(summary.passed).toBe(2)
      // The second test must observe a freshly reset assertion counter, even
      // though the first test bumped it before completing.
      expect(observedAssertionCalls).toEqual([0, 0])
    }
    finally {
      ;(globalThis as any)[expectKey] = previousExpect
    }
  })

  it('runs onFinished callbacks even when a test handler throws', async () => {
    const cleanupOrder: string[] = []
    let activeTask: any = null
    const previousWorker = (globalThis as any).__vitest_worker__
    ;(globalThis as any).__vitest_worker__ = {
      get current() {
        return activeTask
      },
      set current(value: any) {
        activeTask = value
      },
    }

    try {
      renderRegistrations.push(() => {
        collectIt('failing test that registers cleanup', async () => {
          activeTask?.onFinished?.push(async () => {
            cleanupOrder.push('failing-cleanup')
          })
          throw new Error('boom')
        })

        collectIt('passing test that registers cleanup', async () => {
          activeTask?.onFinished?.push(async () => {
            cleanupOrder.push('passing-cleanup')
          })
        })
      })

      const session = createVariantTestSession({
        files: [{
          id: 'story-id',
          path: ['Story'],
          filePath: 'src/components/Example.story.vue',
          supportPluginId: 'vue3',
          moduleId: '/src/components/Example.story.vue',
          story: {
            id: 'story-id',
            title: 'Example',
            layout: { type: 'single' },
            variants: [{
              id: 'variant-id',
              title: 'Default',
            }],
          } as any,
        }],
        moduleLoaders: {
          'story-id': vi.fn(async () => ({
            default: { name: 'OnFinishedComponent' },
          })),
        },
        runWithDynamicImport(importLoader) {
          return importLoader()
        },
      })

      const summary = await session.runVariantTests('story-id', 'variant-id')

      expect(summary.passed).toBe(1)
      expect(summary.failed).toBe(1)
      // Both cleanups must run regardless of test outcome.
      expect(cleanupOrder).toEqual(['failing-cleanup', 'passing-cleanup'])
    }
    finally {
      ;(globalThis as any).__vitest_worker__ = previousWorker
    }
  })
})
