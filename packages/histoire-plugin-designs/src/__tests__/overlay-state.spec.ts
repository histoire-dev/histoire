import { describe, expect, it } from 'vitest'
import { createOverlayState } from '../workbench/canvas/overlay-state.js'
import { createPreferences } from './fixtures/preferences.js'

const target = { storyId: 'button', variantId: 'a' }
const placement = { x: 10, y: 20, width: 300, height: 200, split: 0.4 }

/** Overlay state over in-memory preferences. */
function setup() {
  const { preferences, values } = createPreferences()
  return { state: createOverlayState({ preferences } as never), values }
}

describe('overlay state', () => {
  it('keeps one placement per variant design and forgets it on reset', () => {
    const { state } = setup()
    state.setPlacement(target, 0, placement)
    expect(state.placement(target, 0)).toEqual(placement)
    expect(state.placement(target, 1)).toBeUndefined()
    expect(state.placement({ storyId: 'button', variantId: 'b' }, 0)).toBeUndefined()
    state.reset(target, 0)
    expect(state.placement(target, 0)).toBeUndefined()
  })

  it('clamps opacity to a visible range', () => {
    const { state, values } = setup()
    expect(state.opacity()).toBe(0.5)
    state.setOpacity(0)
    expect(state.opacity()).toBe(0.1)
    values.set('overlay-opacity', 'loud')
    expect(state.opacity()).toBe(0.5)
  })
})
