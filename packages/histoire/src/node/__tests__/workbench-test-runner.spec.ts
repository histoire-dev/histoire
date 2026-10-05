import type { HistoireTestRunSummary } from '@histoire/protocol'
import { mergeHistoireTestSummaries } from '@histoire/shared'
import { describe, expect, it, vi } from 'vitest'
import { createDevWorkbenchTestsOptions } from '../../../../histoire-app/src/app/components/panes/tests/dev-runner.js'

/** Supply only browser capabilities consumed by the correlated dev runner. */
function createRunner(sendEvent = vi.fn(async (): Promise<HistoireTestRunSummary> => mergeHistoireTestSummaries([]))) {
  const host = { __HST_PLUGIN_API__: { sendEvent } } as unknown as Window
  return { options: createDevWorkbenchTestsOptions(host), sendEvent }
}

describe('workbench server test adapter', () => {
  it('requests project and changed-story discovery without running assertions', async () => {
    const { options, sendEvent } = createRunner()
    await options.collectProject!(new AbortController().signal)
    await options.collectStory!('story', new AbortController().signal)
    expect(sendEvent.mock.calls.map(call => call.slice(0, 2))).toEqual([['collectStoryTests', {}], ['collectStoryTests', { storyId: 'story' }]])
  })
  it('requests one complete project run without per-variant worker startup', async () => {
    const { options, sendEvent } = createRunner()
    await options.runProject!(new AbortController().signal)
    expect(sendEvent).toHaveBeenCalledTimes(1)
    expect(sendEvent).toHaveBeenCalledWith('runStoryTests', {}, expect.any(AbortSignal))
  })

  it('requests one changed story run covering all its variants', async () => {
    const { options, sendEvent } = createRunner()
    await options.runStory!('story', new AbortController().signal)
    expect(sendEvent).toHaveBeenCalledTimes(1)
    expect(sendEvent).toHaveBeenCalledWith('runStoryTests', { storyId: 'story' }, expect.any(AbortSignal))
  })

  it('retains exact selection for explicit target execution', async () => {
    const { options, sendEvent } = createRunner()
    await options.run!({ storyId: 'story', variantId: 'variant' }, new AbortController().signal)
    expect(sendEvent).toHaveBeenCalledWith('runStoryTests', { storyId: 'story', variantId: 'variant' }, expect.any(AbortSignal))
  })

  it('passes caller cancellation to correlated server execution', async () => {
    const { options, sendEvent } = createRunner()
    const controller = new AbortController()
    await options.runProject!(controller.signal)

    expect(sendEvent).toHaveBeenCalledWith('runStoryTests', {}, controller.signal)
  })

  it('retires cancelled publication while observing late server completion', async () => {
    let finish!: (summary: HistoireTestRunSummary) => void
    const sendEvent = vi.fn(() => new Promise<HistoireTestRunSummary>((resolve) => {
      finish = resolve
    }))
    const { options } = createRunner(sendEvent)
    const controller = new AbortController()
    const result = options.runProject!(controller.signal)
    const cancelled = expect(result).rejects.toMatchObject({ code: 'CANCELLED' })
    controller.abort()
    await cancelled
    finish(mergeHistoireTestSummaries([]))
    await Promise.resolve()
    expect(sendEvent).toHaveBeenCalledTimes(1)
  })
})
