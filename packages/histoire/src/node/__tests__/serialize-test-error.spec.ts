import { describe, expect, it } from 'vitest'
import { formatTestError, serializeTestError } from '../../../../histoire-shared/src/test-errors.js'
import { mergeTestDefinitionsAndSummary } from '../../../../histoire-shared/src/test-results.js'

describe('formatTestError', () => {
  it('strips ANSI color escapes from node-side colorized diffs', () => {
    const formatted = formatTestError({
      message: 'expected \u001B[32mgreen\u001B[39m to be \u001B[31mred\u001B[39m',
      diff: '\u001B[32m- expected\u001B[39m\n\u001B[31m+ received\u001B[39m',
    })

    expect(formatted).not.toContain('\u001B[')
    expect(formatted).toContain('expected green to be red')
    expect(formatted).toContain('- expected')
  })
})

describe('mergeTestDefinitionsAndSummary', () => {
  it('keeps summary tests that match no definition visible', () => {
    // A run-level failure produces a synthetic test (id `storyId:variantId:0`)
    // that never matches the positional definition ids — dropping it shows
    // "Failed 1" in the tag row while every listed test says "Not run".
    const merged = mergeTestDefinitionsAndSummary(
      [{ id: '0', name: 'real test', fullName: 'suite > real test' }],
      {
        ok: false,
        total: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        errors: [],
        tests: [{
          id: 'story:variant:0',
          name: 'run',
          fullName: 'run',
          state: 'failed',
          errors: [{ message: 'run crashed' }],
        }],
      },
    )

    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ id: '0', state: 'idle' })
    expect(merged[1]).toMatchObject({ id: 'story:variant:0', state: 'failed' })
  })

  it('does not duplicate summary tests that matched a definition', () => {
    const merged = mergeTestDefinitionsAndSummary(
      [{ id: '0', name: 'a', fullName: 'a' }],
      {
        ok: true,
        total: 1,
        passed: 1,
        failed: 0,
        skipped: 0,
        errors: [],
        tests: [{ id: '0', name: 'a', fullName: 'a', state: 'passed', errors: [] }],
      },
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: '0', state: 'passed' })
  })
})

describe('serializeTestError', () => {
  it('produces a structured-clone-safe result for an Error with a non-cloneable cause', () => {
    const error = new Error('boom', { cause: () => {} })
    const serialized = serializeTestError(error)

    // The serialized error crosses a postMessage/WS structured-clone boundary,
    // so it must not carry a raw function that would throw DataCloneError.
    expect(() => structuredClone(serialized)).not.toThrow()
  })

  it('preserves a cloneable plain-object cause', () => {
    const error = new Error('boom', { cause: { a: 1 } })
    const serialized = serializeTestError(error)

    expect(serialized).toMatchObject({ raw: { a: 1 } })
  })

  it('sanitizes a non-cloneable raw field on an object-with-message error', () => {
    const serialized = serializeTestError({ message: 'x', raw: () => {} })

    expect(() => structuredClone(serialized)).not.toThrow()
  })
})
