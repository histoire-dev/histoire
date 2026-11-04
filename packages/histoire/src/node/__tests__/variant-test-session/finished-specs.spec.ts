import { describe, expect, it, vi } from 'vitest'
import { FINISHED_SPECS_GC_THRESHOLD, releaseFinishedSpecs } from '../../virtual/variant-test-session/finished-specs.js'

/** Page globals as the test browser exposes them. */
function page(usedJSHeapSize: number | undefined, gc: (() => void) | undefined = vi.fn()) {
  return { gc, performance: { memory: usedJSHeapSize === undefined ? undefined : { usedJSHeapSize } } }
}

describe('releasing documents of finished spec files', () => {
  it('collects garbage once the tab heap passes the threshold', () => {
    const heavy = page(FINISHED_SPECS_GC_THRESHOLD + 1)
    releaseFinishedSpecs(heavy)
    expect(heavy.gc).toHaveBeenCalledOnce()

    const light = page(FINISHED_SPECS_GC_THRESHOLD - 1)
    releaseFinishedSpecs(light)
    expect(light.gc).not.toHaveBeenCalled()
  })

  it('does nothing in browsers without an exposed collector', () => {
    expect(() => releaseFinishedSpecs(page(FINISHED_SPECS_GC_THRESHOLD + 1, undefined))).not.toThrow()
  })
})
