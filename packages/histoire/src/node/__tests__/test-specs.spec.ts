import type { Context } from '../context.js'
import fs from 'node:fs'
import { join, relative } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupRunTestsTempDirs,
  createRunTestsContext,
  createRunTestsStoryFile,
  installRunTestsMocks,
} from './utils/run-tests-harness.js'

/**
 * The specs a run generates on disk and the summary it builds from their
 * results: one file per variant, isolated per run and removed afterwards.
 */

let mocks: ReturnType<typeof installRunTestsMocks>
let runHistoireTests: Awaited<ReturnType<ReturnType<typeof installRunTestsMocks>['load']>>

beforeEach(async () => {
  vi.resetModules()
  mocks = installRunTestsMocks()
  runHistoireTests = await mocks.load()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  cleanupRunTestsTempDirs()
})

describe('runHistoireTests generated specs', () => {
  it('generates distinct spec paths for variant ids that sanitize identically', async () => {
    // 'a/b' and 'a b' both sanitize to 'a_b'; without a disambiguator the two
    // spec files collide on disk and the second variant's tests are dropped.
    const collidingStory = {
      id: 'colliding-story',
      path: '/virtual-root/src/colliding.story.ts',
      relativePath: 'src/colliding.story.ts',
      fileName: 'colliding',
      supportPluginId: 'vue3',
      moduleId: '/virtual-root/src/colliding.story.ts',
      virtual: true,
      moduleCode: `
        import { onTest } from 'histoire/client'
        onTest(() => {})
      `,
      story: {
        id: 'colliding-story',
        title: 'colliding-story',
        variants: [
          { id: 'a/b', title: 'a/b' },
          { id: 'a b', title: 'a b' },
        ],
      },
    }

    await runHistoireTests(createRunTestsContext([collidingStory as any]))

    const include = mocks.createVitestMock.mock.calls[0][1].include as string[]
    expect(include).toHaveLength(2)
    // The two generated spec paths must be distinct (no overwrite/collision).
    expect(new Set(include).size).toBe(2)
    // The human-readable sanitized segment is still present in each path.
    expect(include.every(path => path.includes('a_b'))).toBe(true)
  })

  it('generates specs that preserve Vitest definition modes', async () => {
    const eligibleStory = createRunTestsStoryFile({
      id: 'skip-story',
      variantId: 'skip-variant',
      source: `
        import { onTest } from 'histoire/client'
        onTest(() => {})
      `,
    })

    await runHistoireTests(createRunTestsContext([eligibleStory]))

    const specPath = mocks.createVitestMock.mock.calls[0][1].include[0]
    const specCode = mocks.generatedSpecCode.get(specPath) ?? ''

    expect(specCode).toContain(`import { describe, test } from '@vitest/runner'`)
    expect(specCode).not.toContain(`from 'vitest'`)
    expect(specCode).toContain(`if (definition.mode === 'todo')`)
    expect(specCode).toContain(`definition.mode === 'only' ? test.only`)
    expect(specCode).toContain(`: definition.mode === 'skip' ? test.skip`)
  })

  it('uses collected definition order as summary ids for server-side runs', async () => {
    const eligibleStory = createRunTestsStoryFile({
      id: 'summary-id-story',
      variantId: 'summary-id-variant',
      source: `
        import { onTest } from 'histoire/client'
        onTest(() => {})
      `,
    })
    mocks.setTestModules(options => [{
      moduleId: options.include[0],
      errors: () => [],
      children: {
        allTests: () => [
          {
            name: 'first collected test',
            result: () => ({ state: 'passed', errors: [] }),
          },
          {
            name: 'second collected test',
            result: () => ({ state: 'passed', errors: [] }),
          },
        ],
      },
    }])

    const summary = await runHistoireTests(createRunTestsContext([eligibleStory]))

    expect(summary.tests.map(test => test.id)).toEqual(['0', '1'])
  })

  it('keeps delimiter-colliding targets distinct in all-story summaries', async () => {
    const stories = [{ id: 'a:b', variantId: 'c' }, { id: 'a', variantId: 'b:c' }]
      .map(target => createRunTestsStoryFile({ ...target, source: 'onTest(() => {})' }))
    mocks.setTestModules(options => options.include.map((moduleId: string, index: number) => ({
      moduleId,
      errors: () => [],
      children: { allTests: () => index === 0
        ? [{ name: 'first', result: () => ({ state: 'passed', errors: [] }) }, { name: 'skipped', result: () => ({ state: 'skipped', errors: [] }) }]
        : [{ name: 'second', result: () => ({ state: 'failed', errors: [new Error('second target assertion')] }) }] },
    })))

    const summary = await runHistoireTests(createRunTestsContext(stories))

    expect(mocks.collectStoriesBrowserMock).toHaveBeenCalledTimes(1)
    expect(mocks.createVitestMock).toHaveBeenCalledTimes(1)
    expect(mocks.createVitestMock.mock.calls[0][1].include).toHaveLength(2)
    expect(summary).toMatchObject({ ok: false, total: 3, passed: 1, failed: 1, skipped: 1 })
    expect(summary.errors).toEqual([expect.objectContaining({ message: 'second target assertion' })])
    expect(summary.tests.map(({ id, name, storyId, variantId }) => ({ id, name, storyId, variantId }))).toEqual([
      { id: '0', name: 'first', storyId: 'a:b', variantId: 'c' },
      { id: '1', name: 'skipped', storyId: 'a:b', variantId: 'c' },
      { id: '0', name: 'second', storyId: 'a', variantId: 'b:c' },
    ])
  })

  it('isolates generated specs per run and removes them afterwards', async () => {
    const story = createRunTestsStoryFile({
      id: 'isolated-story',
      variantId: 'isolated-variant',
      source: 'onTest(() => {})',
    })
    const ctx = createRunTestsContext([story])

    // Two runs in the same project must not share (and empty) one spec
    // directory, or concurrent `histoire test` runs clobber each other.
    await runHistoireTests(ctx)
    const firstSpec = mocks.createVitestMock.mock.calls[0][1].include[0] as string
    await runHistoireTests(ctx)
    const secondSpec = mocks.createVitestMock.mock.calls[1][1].include[0] as string

    expect(runDirectoryOf(ctx, firstSpec)).not.toBe(runDirectoryOf(ctx, secondSpec))
    // Each run cleans up its own directory once it is done.
    expect(fs.existsSync(firstSpec)).toBe(false)
    expect(fs.existsSync(secondSpec)).toBe(false)
  })

  it('removes the generated spec directory when the run fails', async () => {
    const story = createRunTestsStoryFile({
      id: 'failing-story',
      variantId: 'failing-variant',
      source: 'onTest(() => {})',
    })
    mocks.setTestModules(options => [{
      moduleId: options.include[0],
      errors: () => [new Error('story import exploded')],
      children: { allTests: () => [] },
    }])
    const ctx = createRunTestsContext([story])

    await expect(runHistoireTests(ctx)).rejects.toThrow(/story import exploded/)

    expect(fs.readdirSync(join(ctx.root, '.histoire', 'tmp', 'tests'))).toEqual([])
  })
})

/**
 * Returns the per-run directory segment a generated spec path belongs to.
 */
function runDirectoryOf(ctx: Context, specPath: string) {
  return relative(join(ctx.root, '.histoire', 'tmp', 'tests'), specPath).split('/')[0]
}
