import { describe, expect, it } from 'vitest'
import { matchNode } from '../workbench/locate.js'

/** Live report with one `label` violation on the given elements. */
function report(selectors: string[][]) {
  return { violations: [{ id: 'label', impact: 'critical', help: '', helpUrl: '', nodes: selectors.map(chain => ({ selectors: chain })) }], incomplete: [] } as any
}

describe('matching a reported element in a live report', () => {
  it('prefers the same selectors, then the same position when the rule has as many elements', () => {
    const live = report([['#a'], ['.wrapper > input']])
    expect(matchNode(live, { outcome: 'violations', rule: 'label', selectors: ['.wrapper > input'], index: 0, count: 2 })).toBe(live.violations[0].nodes[1])
    // Selectors computed in another document still map by position.
    expect(matchNode(live, { outcome: 'violations', rule: 'label', selectors: ['body > input'], index: 1, count: 2 })).toBe(live.violations[0].nodes[1])
  })

  it('finds nothing when the rule or a reliable position is missing', () => {
    const live = report([['#a']])
    expect(matchNode(live, { outcome: 'violations', rule: 'label', selectors: ['#b'], index: 1, count: 2 })).toBeUndefined()
    expect(matchNode(live, { outcome: 'violations', rule: 'image-alt', selectors: ['#a'], index: 0, count: 1 })).toBeUndefined()
    expect(matchNode(live, { outcome: 'incomplete', rule: 'label', selectors: ['#a'], index: 0, count: 1 })).toBeUndefined()
  })
})
