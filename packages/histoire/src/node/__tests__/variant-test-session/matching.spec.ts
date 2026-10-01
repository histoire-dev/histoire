import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('getMatchingDefinition', () => {
  let getMatchingDefinition: typeof import('../../virtual/variant-test-session/index.js').getMatchingDefinition

  beforeEach(async () => {
    vi.resetModules()
    // Stub the mount module so importing the session module does not pull the
    // browser-only virtual support-plugin chain into this Node test.
    vi.doMock('../../virtual/variant-test-mount.js', () => ({
      bootstrapVariant: vi.fn(),
      mountRenderVariant: vi.fn(),
    }))
    ;({ getMatchingDefinition } = await import('../../virtual/variant-test-session/index.js'))
  })

  it('matches by stable fullName when the collection is reordered relative to the serialized id', () => {
    // Positional ids are unstable: a reordered collection means id '0' points at
    // a different test than when it was serialized. Matching must follow fullName.
    const definitions = [
      { id: '0', name: 'b', fullName: 'suite > b' },
      { id: '1', name: 'a', fullName: 'suite > a' },
    ]
    const serialized = { id: '1', name: 'b', fullName: 'suite > b' }

    const matched = getMatchingDefinition(definitions, serialized)

    expect(matched).toBe(definitions[0])
  })

  it('takes the fast path on an exact id + fullName match', () => {
    const definitions = [
      { id: '0', name: 'a', fullName: 'suite > a' },
      { id: '1', name: 'b', fullName: 'suite > b' },
    ]
    const serialized = { id: '1', name: 'b', fullName: 'suite > b' }

    expect(getMatchingDefinition(definitions, serialized)).toBe(definitions[1])
  })

  it('returns undefined for a genuine miss', () => {
    const definitions = [
      { id: '0', name: 'a', fullName: 'suite > a' },
    ]
    const serialized = { id: '5', name: 'gone', fullName: 'suite > gone' }

    expect(getMatchingDefinition(definitions, serialized)).toBeUndefined()
  })

  it('returns undefined when a removed test id now belongs to another test', () => {
    const definitions = [
      { id: '0', name: 'replacement', fullName: 'suite > replacement' },
    ]
    const serialized = { id: '0', name: 'removed', fullName: 'suite > removed' }

    expect(getMatchingDefinition(definitions, serialized)).toBeUndefined()
  })

  it('returns undefined when reordered collection has ambiguous duplicate names', () => {
    const definitions = [
      { id: '0', name: 'same', fullName: 'suite > same' },
      { id: '1', name: 'same', fullName: 'suite > same' },
    ]
    const serialized = { id: '4', name: 'same', fullName: 'suite > same' }

    expect(getMatchingDefinition(definitions, serialized)).toBeUndefined()
  })
})
