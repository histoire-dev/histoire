import type { HistoireSnapshot } from '@histoire/protocol'
import { describe, expect, it } from 'vitest'
import { createInspectorEventCounter, findChangedSourceLine, getInspectorTabs, isInspectorTestsEnabled, normalizeInspectorTab } from '../../../../histoire-app/src/app/components/inspector/state.js'

/** Minimal immutable session projection for event ownership tests. */
function snapshot(variantId: string, sequences: number[], runtimeId = 'runtime'): HistoireSnapshot {
  return {
    selection: { storyId: 'story', variantId },
    runtime: { runtimeId },
    source: { sourceId: 'book', epoch: 'epoch' },
    events: { items: sequences.map(sequence => ({ sequence, runtimeId, target: { storyId: 'story', variantId }, payload: null, timestamp: 0 })) },
  } as HistoireSnapshot
}

describe('inspector selection behavior', () => {
  it('retains exact legacy route tab values and falls back to props', () => {
    expect(['', 'docs', 'events', 'tests'].map(value => normalizeInspectorTab(value))).toEqual(['', 'docs', 'events', 'tests'])
    expect(normalizeInspectorTab('controls')).toBe('')
    expect(normalizeInspectorTab('unknown')).toBe('')
    expect(normalizeInspectorTab(['docs'])).toBe('')
  })

  it('allows Tests only for a dev build connected to a dev source and falls back dynamically', () => {
    const dev = isInspectorTestsEnabled(true, 'dev')
    expect(dev).toBe(true)
    expect(getInspectorTabs(dev).map(tab => tab.value)).toEqual(['', 'docs', 'events', 'tests'])
    expect(normalizeInspectorTab('tests', dev)).toBe('tests')
    for (const enabled of [isInspectorTestsEnabled(false, 'dev'), isInspectorTestsEnabled(true, 'static'), isInspectorTestsEnabled(false, 'static'), isInspectorTestsEnabled(true, undefined)]) {
      expect(enabled).toBe(false)
      expect(getInspectorTabs(enabled).map(tab => tab.value)).toEqual(['', 'docs', 'events'])
      expect(normalizeInspectorTab('tests', enabled)).toBe('')
      expect(normalizeInspectorTab('docs', enabled)).toBe('docs')
      expect(normalizeInspectorTab('events', enabled)).toBe('events')
    }
    // A retained URL intent may become available again after source replacement.
    expect(normalizeInspectorTab('tests', isInspectorTestsEnabled(true, 'dev'))).toBe('tests')
  })

  it('counts only unread events from selected runtime and retires count on navigation', () => {
    const counter = createInspectorEventCounter()
    expect(counter.observe(snapshot('first', [1, 2]), false)).toBe(2)
    expect(counter.observe(snapshot('first', [1, 2]), true)).toBe(0)
    const next = snapshot('first', [1, 2, 3])
    next.events.items = [...next.events.items, { ...next.events.items[0], sequence: 4, runtimeId: 'old' }, { ...next.events.items[0], sequence: 5, target: { storyId: 'other', variantId: 'first' } }]
    expect(counter.observe(next, false)).toBe(1)
    expect(counter.observe(snapshot('second', [6]), false)).toBe(0)
    expect(counter.observe(snapshot('second', [6, 7]), false)).toBe(1)
    expect(counter.observe(snapshot('second', [8], 'replacement'), false)).toBe(0)
  })

  it('finds first changed source line without marking initial or unchanged content', () => {
    expect(findChangedSourceLine(undefined, '<Button />')).toBe(-1)
    expect(findChangedSourceLine('same', 'same')).toBe(-1)
    expect(findChangedSourceLine('<Button\n  count="1"\n/>', '<Button\n  count="2"\n/>')).toBe(1)
    expect(findChangedSourceLine('first\nlast', 'first\nadded\nlast')).toBe(1)
    expect(findChangedSourceLine('first\nlast', 'first')).toBe(0)
  })
})
