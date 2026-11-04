import type { CatalogSnapshot } from '../../runtime/catalog/types.js'
import type { AffectedChange } from '../../runtime/terminal/affected/types.js'
import { expect, it } from 'vitest'
import { selectAffected } from '../../runtime/terminal/affected/select.js'

/** Catalog whose IDs share delimiters and prefixes. */
const snapshot = {
  revision: 'r1',
  stories: ['a', 'a::b', 'a/b', 'a b'].map((id, index) => ({ id, filePath: `s${index}.story.ts`, docsOnly: false, variants: [{ id: 'x::y', title: 'x' }, { id: 'x', title: 'x' }] })),
} as unknown as CatalogSnapshot

/** Change owned by exactly the given stories. */
const owned = (storyIds: string[], file = '/p/helper.ts'): AffectedChange => ({ event: 'change', file, reason: 'shared', storyIds, proven: storyIds, whole: false, conservative: false, seq: 1 })

it('keeps IDs containing delimiters distinct', () => {
  expect(selectAffected(snapshot, '/p', { scope: 'all' }, [owned(['a::b'])]).storyIds).toEqual(['a::b'])
  expect(selectAffected(snapshot, '/p', { scope: 'all' }, [owned(['a/b', 'a'])]).storyIds).toEqual(['a', 'a/b'])
})

it('keeps the exact variant of an affected story and reports a vanished variant as missing', () => {
  const variant = { scope: 'variant', storyId: 'a', variantId: 'x::y' } as const
  expect(selectAffected(snapshot, '/p', variant, [owned(['a'])]).targets).toEqual([variant])
  expect(selectAffected(snapshot, '/p', variant, [owned(['a::b'])])).toMatchObject({ status: 'ok', storyIds: [], reason: 'independent' })
  expect(selectAffected(snapshot, '/p', { ...variant, variantId: 'x:y' }, [owned(['a'])])).toMatchObject({ status: 'missing', storyIds: [], missing: ['a'] })
})

it('selects a story registered by an edited file even when its ID changed since the graph was proved', () => {
  const edited = owned(['old-id'], '/p/s2.story.ts')
  expect(selectAffected(snapshot, '/p', { scope: 'all' }, [edited])).toMatchObject({ storyIds: ['a/b'], conservative: false })
  expect(selectAffected(snapshot, '/p', { scope: 'story', storyId: 'old-id' }, [edited])).toMatchObject({ status: 'missing', missing: ['old-id'] })
})

it('flags whole-scope and unproven selections as conservative and reports no catalog', () => {
  const whole: AffectedChange = { ...owned([]), reason: 'structural', proven: [], whole: true, conservative: true }
  expect(selectAffected(snapshot, '/p', { scope: 'story', storyId: 'a' }, [whole])).toMatchObject({ storyIds: ['a'], reason: 'structural', conservative: true })
  expect(selectAffected(undefined, '/p', { scope: 'all' }, [whole]).status).toBe('unavailable')
})
