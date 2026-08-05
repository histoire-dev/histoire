import type { Story, Variant } from '@histoire/shared'
import { describe, expect, it } from 'vitest'
import { resolveAutoSelectedVariantId } from '../../../../histoire-app/src/app/util/variant-selection.js'

/**
 * Behavioral tests for the rule `StoryView.vue` applies when a story is opened
 * without a `variantId` in the URL.
 *
 * The rule decides whether a story is deep-linkable right after a sidebar click
 * or whether the user has to pick from the variant list first, which is easy to
 * break unnoticed — the e2e specs that cover it need a browser and a dev server.
 * The rule itself is a pure function precisely so it can be pinned here.
 */
describe('story variant auto selection', () => {
  /** Minimal variant, only the fields the rule reads. */
  function createVariant(id: string): Variant {
    return { id, title: id, state: {} } as Variant
  }

  /** Minimal story around the given variant ids. */
  function createStory(variantIds: string[], lastSelectedVariant?: Variant): Story {
    return {
      id: 'story',
      title: 'Story',
      variants: variantIds.map(createVariant),
      lastSelectedVariant,
    } as Story
  }

  it('leaves the route alone when the URL already selects a variant', () => {
    const story = createStory(['a', 'b'])
    expect(resolveAutoSelectedVariantId(story, story.variants[1])).toBe(null)
  })

  it('leaves the route alone when no story matches', () => {
    expect(resolveAutoSelectedVariantId(null, null)).toBe(null)
  })

  it('selects the only variant of a single-variant story', () => {
    expect(resolveAutoSelectedVariantId(createStory(['only']), null)).toBe('only')
  })

  it('does not select anything for a multi-variant story opened for the first time', () => {
    // The variant list is shown instead, so a story gaining a second variant
    // silently stops putting a variantId in the URL on open.
    expect(resolveAutoSelectedVariantId(createStory(['a', 'b']), null)).toBe(null)
  })

  it('restores the previous selection when reopening a story', () => {
    const story = createStory(['a', 'b'])
    story.lastSelectedVariant = story.variants[1]
    expect(resolveAutoSelectedVariantId(story, null)).toBe('b')
  })

  it('ignores a previous selection whose variant a hot update removed', () => {
    // Restoring it would put a dead variantId in the URL and render nothing.
    const story = createStory(['a', 'b'], createVariant('gone'))
    expect(resolveAutoSelectedVariantId(story, null)).toBe(null)
  })
})
