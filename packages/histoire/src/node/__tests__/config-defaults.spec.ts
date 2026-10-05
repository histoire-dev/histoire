import { describe, expect, it } from 'vitest'
import { getDefaultConfig } from '../config/defaults.js'

describe('default configuration', () => {
  it('limits each canvas to twelve live preview frames by default', () => {
    expect(getDefaultConfig().ui.frameBudget).toBe(12)
  })
})
