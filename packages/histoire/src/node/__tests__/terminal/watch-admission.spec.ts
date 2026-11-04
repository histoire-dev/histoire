import { describe, expect, it } from 'vitest'
import { planAdmission } from '../../runtime/terminal/watch/plan.js'
import { createWatchHarness } from './watch-harness.js'

describe('admission', () => {
  it('falls back to the scope run when the affected set exceeds the batch cap', () => {
    const stories = Array.from({ length: 2100 }, (_, index) => ({ id: `s${index}`, docsOnly: false }))
    const snapshot = { stories } as never
    const claim = (count: number) => ({ changes: [], carried: [], whole: false, count })
    const select = (count: number) => planAdmission({ scope: 'all' }, { status: 'ok', storyIds: stories.slice(0, count).map(story => story.id) } as never, claim(count), snapshot)
    expect(select(2000)).toMatchObject({ kind: 'affected' })
    expect(select(2001)).toEqual({ kind: 'scope' })
  })

  it('observes files only while enabled', async () => {
    const h = createWatchHarness()
    h.scheduler.set({ enabled: true, scope: { scope: 'all' } })
    expect(h.attached()).toBe(true)
    h.scheduler.set({ enabled: false })
    expect(h.attached()).toBe(false)
    h.scheduler.set({ enabled: true, scope: { scope: 'all' } })
    expect(h.attached()).toBe(true)
  })
})
