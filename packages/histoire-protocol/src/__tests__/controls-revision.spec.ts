import { describe, expect, it } from 'vitest'
import { createControlsStateRevision } from '../serialization/controls-revision.js'

describe('controls state acknowledgment revision', () => {
  it('rejects old acknowledgment after local edit before wrapper admits edit', () => {
    const child = createControlsStateRevision()
    const wrapper = createControlsStateRevision()
    expect(child.accept(wrapper.current)).toBe(true)
    const first = child.capture()
    expect(wrapper.receive(first)).toBe(true)
    const oldAcknowledgment = wrapper.current
    const second = child.capture()
    // Child already has new typing, but its STATE_SYNC is still in transit.
    expect(child.accept(oldAcknowledgment)).toBe(false)
    expect(wrapper.receive(second)).toBe(true)
    expect(child.accept(wrapper.current)).toBe(true)
  })

  it('rejects invalid/replayed revisions, resets with document and preserves legacy messages', () => {
    const owner = createControlsStateRevision()
    expect(owner.receive(2)).toBe(true)
    expect(owner.receive(1)).toBe(false)
    expect(owner.receive(2)).toBe(false)
    for (const value of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1, '2']) {
      expect(owner.receive(value)).toBe(false)
      expect(owner.accept(value)).toBe(false)
    }
    expect(owner.receive(undefined)).toBe(true)
    expect(owner.accept(undefined)).toBe(true)
    const replacement = createControlsStateRevision()
    expect(replacement.current).toBe(0)
    expect(replacement.accept(2)).toBe(false)
    expect(replacement.capture()).toBe(1)
  })
})
