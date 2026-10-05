import { describe, expect, it } from 'vitest'
import { createPropOverridePatch, getControlStateKeys } from './model'

describe('shared generic controls model', () => {
  it('exposes ordinary state while hiding derived metadata and empty Vue data', () => {
    expect(getControlStateKeys({ title: 'Hello', _hPropDefs: [], _hPropState: {}, $data: {} })).toEqual(['title'])
    expect(getControlStateKeys({ $data: { count: 1 }, callback: () => {} })).toEqual(['$data', 'callback'])
  })

  it('patches one prop without mutating mirror and removes override without losing siblings', () => {
    const state = { _hPropState: { 0: { title: 'Old', count: 2 }, 1: { active: true } } }
    expect(createPropOverridePatch(state, 0, 'title', 'New')).toEqual({ _hPropState: { 0: { title: 'New', count: 2 }, 1: { active: true } } })
    expect(createPropOverridePatch(state, 0, 'title', undefined, true)).toEqual({ _hPropState: { 0: { count: 2 }, 1: { active: true } } })
    expect(state._hPropState[0].title).toBe('Old')
  })
})
