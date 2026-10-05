import { describe, expect, it } from 'vitest'
import { getDefaultConfig } from '../config/defaults.js'

describe('default configuration', () => {
  it('limits each canvas to six live preview frames by default', () => {
    expect(getDefaultConfig().ui.frameBudget).toBe(6)
  })
})
