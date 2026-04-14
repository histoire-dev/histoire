import { describe, expect, it } from 'vitest'
import {
  getCollectionVitestCliOptions,
  HistoireCollectionReporter,
} from '../collect/reporter.js'

describe('histoireCollectionReporter', () => {
  it('is a no-op reporter instance', () => {
    expect(new HistoireCollectionReporter()).toBeInstanceOf(HistoireCollectionReporter)
  })
})

describe('getCollectionVitestCliOptions', () => {
  it('runs collection silently in normal mode', () => {
    const options = getCollectionVitestCliOptions(false)

    expect(options.silent).toBe('passed-only')
    expect(options.reporters).toHaveLength(1)
    expect(options.reporters[0]).toBeInstanceOf(HistoireCollectionReporter)
  })

  it('uses the verbose reporter in debug mode', () => {
    expect(getCollectionVitestCliOptions(true)).toEqual({
      reporters: ['verbose'],
    })
  })
})
