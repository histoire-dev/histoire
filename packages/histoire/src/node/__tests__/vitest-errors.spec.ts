import { describe, expect, it } from 'vitest'
import { assertVitestRunHasNoUnhandledErrors, formatVitestError, getUnhandledVitestErrors } from '../util/vitest-errors.js'

describe('vitest-errors helpers', () => {
  it('formats Error instances with their message', () => {
    expect(formatVitestError(new Error('boom'))).toContain('boom')
  })

  it('formats plain objects with a message field', () => {
    expect(formatVitestError({ message: 'plain failure' })).toBe('plain failure')
  })

  it('throws when vitest exposes unhandled errors', () => {
    const vitest = {
      state: {
        getUnhandledErrors: () => [
          new Error('browser crashed'),
          { message: 'module setup failed' },
        ],
      },
    }

    expect(getUnhandledVitestErrors(vitest)).toEqual([
      expect.stringContaining('browser crashed'),
      'module setup failed',
    ])
    expect(() => assertVitestRunHasNoUnhandledErrors(vitest)).toThrowError(/browser crashed/)
  })
})
