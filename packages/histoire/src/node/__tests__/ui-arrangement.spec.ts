import { describe, expect, it } from 'vitest'
import { resolveWorkbenchArrangement } from '../../../../histoire-app/src/app/standalone/arrangement.js'

describe('standalone canvas arrangement', () => {
  it('honors declared single layouts while keeping inferred layouts on existing defaults', () => {
    expect(resolveWorkbenchArrangement(undefined, 'single', 'list', 'grid', true)).toBe('single')
    expect(resolveWorkbenchArrangement(undefined, 'single', 'list', 'grid', false)).toBe('list')
    expect(resolveWorkbenchArrangement(undefined, 'single', undefined, 'grid')).toBe('grid')
    expect(resolveWorkbenchArrangement('grid', 'single', undefined, undefined, true)).toBe('grid')
    expect(resolveWorkbenchArrangement('single', 'grid')).toBe('single')
    expect(resolveWorkbenchArrangement(undefined, undefined, 'single')).toBe('single')
  })

  it('preserves explicit story list layout on legacy URLs', () => {
    expect(resolveWorkbenchArrangement(undefined, 'list', 'grid', 'grid')).toBe('list')
    expect(resolveWorkbenchArrangement('unknown', 'list')).toBe('list')
  })

  it('allows URL matrix or grid overrides and local defaults for unconfigured stories', () => {
    expect(resolveWorkbenchArrangement('matrix', 'list')).toBe('matrix')
    expect(resolveWorkbenchArrangement('grid', 'list')).toBe('grid')
    expect(resolveWorkbenchArrangement(undefined, undefined, 'list', 'grid')).toBe('list')
    expect(resolveWorkbenchArrangement(undefined, undefined, undefined, 'list')).toBe('list')
  })
})
