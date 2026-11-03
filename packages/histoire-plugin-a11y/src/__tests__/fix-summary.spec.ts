import { describe, expect, it } from 'vitest'
import { groupNodesByFix, parseFailureSummary } from '../workbench/fix-summary.js'

describe('axe failure summaries', () => {
  it('splits "Fix all" and "Fix any" sections into items', () => {
    expect(parseFailureSummary('Fix all of the following:\n  List element has direct children that are not allowed: div\n\nFix any of the following:\n  Element has no title attribute\n  aria-label attribute does not exist or is empty')).toEqual([
      { kind: 'all', items: ['List element has direct children that are not allowed: div'] },
      { kind: 'any', items: ['Element has no title attribute', 'aria-label attribute does not exist or is empty'] },
    ])
  })

  it('keeps unlabeled text as a single requirement list', () => {
    expect(parseFailureSummary('Element is not focusable')).toEqual([{ kind: 'all', items: ['Element is not focusable'] }])
    expect(parseFailureSummary(undefined)).toEqual([])
  })

  it('groups elements sharing a fix in first-seen order', () => {
    const nodes = [
      { selectors: ['#close'], failureSummary: 'Fix any of the following:\n  a' },
      { selectors: ['ul'], failureSummary: 'Fix all of the following:\n  b' },
      { selectors: ['.toolbar > button'], failureSummary: 'Fix any of the following:\n  a' },
    ]
    expect(groupNodesByFix(nodes).map(group => [group.nodes.map(node => node.selectors[0]), group.sections[0].kind])).toEqual([
      [['#close', '.toolbar > button'], 'any'],
      [['ul'], 'all'],
    ])
  })
})
