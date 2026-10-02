import { expect, it } from 'vitest'
import { mergeConfig } from '../../config/merge.js'

it('preserves user Node build target and source exclusion over defaults', () => {
  const result = mergeConfig({ build: { target: 'node', node: { includeSource: false }, excludeFromVendorsChunk: ['custom'] } }, { build: { target: 'static', node: { includeSource: true }, excludeFromVendorsChunk: ['default'] } })
  expect(result.build.target).toBe('node')
  expect(result.build.node.includeSource).toBe(false)
  expect(result.build.excludeFromVendorsChunk).toEqual(expect.arrayContaining(['custom', 'default']))
})
