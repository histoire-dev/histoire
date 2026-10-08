import type { Context } from '../context.js'
import { describe, expect, it } from 'vitest'
import { getDefaultConfig } from '../config/defaults.js'
import { processConfig } from '../config/process.js'

describe('matrix numeric configuration', () => {
  it('provides built-in samples and normalizes explicit defaults', async () => {
    const config = getDefaultConfig()
    expect(config.ui.matrix?.numericValues).toEqual([0, 1, 2, 5, 10])
    config.ui.matrix = { numericValues: [-0, 0, 0.5, 2] }
    await processConfig({ config, root: '/tmp' } as Context)
    expect(config.ui.matrix.numericValues).toEqual([0, 0.5, 2])
  })

  it('rejects malformed defaults before browser configuration is emitted', async () => {
    for (const numericValues of [[], [1], [Number.NaN, 2], [Infinity, 2], Array.from({ length: 65 }, (_, index) => index)]) {
      const config = getDefaultConfig()
      config.ui.matrix = { numericValues }
      await expect(processConfig({ config, root: '/tmp' } as Context)).rejects.toThrow('ui.matrix.numericValues')
    }
  })
})
