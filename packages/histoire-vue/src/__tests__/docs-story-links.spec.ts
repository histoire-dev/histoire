import { describe, expect, it } from 'vitest'
import { getDocsStoryHref, resolveDocsStoryLink } from '../components/docs/links.js'

/** Exact collected identities exercise both path and dot-only route encodings. */
const stories = [{ id: 'a:b', variants: [{ id: 'c:d' }] }, { id: '..', variants: [{ id: 'c:d' }] }]
const base = 'https://book.example/book/'

describe('documentation story route parsing', () => {
  it('opens full-book links with exact IDs, router mode, panel, and anchor', () => {
    const link = { selection: { storyId: 'a:b/c', variantId: 'v:"x"' }, panel: 'docs', anchor: '#part' }
    expect(getDocsStoryHref(link, base)).toBe(`${base}story/a%3Ab%2Fc?variantId=v%3A%22x%22&tab=docs#part`)
    expect(getDocsStoryHref(link, base, 'hash')).toBe(`${base}#/story/a%3Ab%2Fc?variantId=v%3A%22x%22&tab=docs#part`)
    expect(getDocsStoryHref({ selection: { storyId: '..', variantId: null } }, base, 'hash')).toBe(`${base}#/story?storyId=..&variantId`)
  })

  it.each(['story/a%3Ab', '#/story/a%3Ab'])('preserves bare null and omitted variants in %s', (path) => {
    expect(resolveDocsStoryLink(`${base}${path}?variantId#part`, base, stories)).toEqual({ selection: { storyId: 'a:b', variantId: null }, anchor: '#part' })
    expect(resolveDocsStoryLink(`${base}${path}#part`, base, stories)).toEqual({ selection: { storyId: 'a:b' }, anchor: '#part' })
    expect(resolveDocsStoryLink(`${base}${path}?variantId=c%3Ad`, base, stories)).toEqual({ selection: { storyId: 'a:b', variantId: 'c:d' } })
    expect(resolveDocsStoryLink(`${base}${path}?variantId=`, base, stories)).toBeNull()
  })

  it.each(['story', 'story/', '#/story', '#/story/'])('resolves dot-only query identity through %s', (path) => {
    expect(resolveDocsStoryLink(`${base}${path}?storyId=..&variantId=c%3Ad`, base, stories)).toEqual({ selection: { storyId: '..', variantId: 'c:d' } })
    expect(resolveDocsStoryLink(`${base}${path}?storyId=a%3Ab`, base, stories)).toBeNull()
  })

  it('preserves requested panel and anchor without accepting unknown targets', () => {
    expect(resolveDocsStoryLink(`${base}story/a%3Ab?variantId=c%3Ad&tab=docs#part`, base, stories)).toEqual({ selection: { storyId: 'a:b', variantId: 'c:d' }, panel: 'docs', anchor: '#part' })
    expect(resolveDocsStoryLink(`${base}story/a%3Ab?variantId=unknown&tab=docs`, base, stories)).toBeNull()
    expect(resolveDocsStoryLink('https://other.example/book/story/a%3Ab?variantId', base, stories)).toBeNull()
  })
})
