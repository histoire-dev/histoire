import { describe, expect, it, vi } from 'vitest'
import { scrollDocsAnchor } from '../components/docs/anchors.js'
import { prepareHistoireDocs } from '../components/docs/content.js'
import { normalizeDocsLinks, resolveDocsStoryLink } from '../components/docs/links.js'
import { sanitizeDocsHtml } from '../components/docs/sanitize.js'

describe('remote documentation policy', () => {
  it('requires explicit first-party trusted policy while default remote HTML stays sanitized', async () => {
    const content = { storyId: 'a', epoch: 'epoch', revision: 'revision', origin: 'sibling' as const, format: 'html' as const, body: '<iframe src="images/demo.html"></iframe><p style="color:red">Local</p>' }
    const remote = await prepareHistoireDocs(content, 'https://book.example/book/', document)
    expect(remote.html).not.toContain('iframe')
    const local = await prepareHistoireDocs(content, 'https://book.example/book/', document, 'trusted-local')
    const root = document.createElement('div')
    root.innerHTML = local.html!
    expect(root.querySelector('iframe')?.src).toBe('https://book.example/book/images/demo.html')
    expect(root.querySelector('p')?.style.color).toBe('red')
  })
  it('resolves book assets before final HTML sanitization and removes executable markup', async () => {
    const unsafe = '<h2 id="local">Heading</h2><img src="images/demo.png" onerror="attack()"><a href="javascript:attack()">bad</a><a href="../story/a%3Ab?variantId=c">Story</a><p style="position:fixed" onclick="attack()">Text</p><script>attack()</script><style>body{display:none}</style><iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x"><svg onload="attack()"></svg>'
    const html = await sanitizeDocsHtml(normalizeDocsLinks(unsafe, 'https://book.example/nested/book/', document), document)
    const root = document.createElement('div')
    root.innerHTML = html
    expect(root.querySelector('img')?.src).toBe('https://book.example/nested/book/images/demo.png')
    expect(root.querySelector('a')?.hasAttribute('href')).toBe(false)
    expect(root.querySelector('a:last-of-type')?.href).toBe('https://book.example/nested/story/a%3Ab?variantId=c')
    expect(root.querySelector('p')?.attributes.length).toBe(0)
    expect(root.querySelector('script,style,iframe,object,embed,svg')).toBeNull()
    expect(root.querySelector('h2')?.id).toBe('local')
    root.innerHTML = await sanitizeDocsHtml(normalizeDocsLinks('<a href="//other.example/path" target="host-frame">External</a>', 'https://book.example/book/', document), document)
    expect(root.querySelector('a')?.target).toBe('_blank')
    expect(root.querySelector('a')?.rel).toBe('noopener noreferrer')
  })

  it('maps only known book routes to structured targets without splitting IDs', () => {
    const stories = [{ id: 'a:b', variants: [{ id: 'c:d' }] }, { id: 'docs', variants: [] }]
    const base = 'https://book.example/book/'
    expect(resolveDocsStoryLink('https://book.example/book/story/a%3Ab?variantId=c%3Ad#part', base, stories)).toEqual({ selection: { storyId: 'a:b', variantId: 'c:d' }, anchor: '#part' })
    expect(resolveDocsStoryLink('https://book.example/book/#/story/docs#part', base, stories)).toEqual({ selection: { storyId: 'docs' }, anchor: '#part' })
    expect(resolveDocsStoryLink('https://other.example/book/story/a%3Ab', base, stories)).toBeNull()
    expect(resolveDocsStoryLink('https://book.example/book/story/a%3Ab?variantId=wrong', base, stories)).toBeNull()
    expect(resolveDocsStoryLink('https://book.example/book/story/a%3Ab', base, [...stories, stories[0]])).toBeNull()
    const custom = [{ id: 'custom:id', relativePath: 'Custom.story.vue', variants: [{ id: 'main' }] }]
    expect(resolveDocsStoryLink('https://book.example/book/story/custom-story-vue?variantId=main', base, custom, 'Custom.story.vue')).toEqual({ selection: { storyId: 'custom:id', variantId: 'main' } })
    expect(resolveDocsStoryLink('https://book.example/book/story/custom-story-vue', base, custom, '../private.vue')).toBeNull()
  })

  it('scrolls matching anchor inside owning panel only, including escaped IDs', () => {
    document.body.innerHTML = '<div id="outside"><h2 id="part:one">Host</h2></div><section><h2 id="part:one">Panel</h2></section><section><h2 id="part:one">Other</h2></section>'
    const panel = document.querySelector('section')!
    const inside = panel.firstElementChild! as HTMLElement
    inside.getBoundingClientRect = vi.fn().mockReturnValue({ top: 120 })
    panel.getBoundingClientRect = vi.fn().mockReturnValue({ top: 20 })
    expect(scrollDocsAnchor(panel, '#part%3Aone')).toBe(true)
    expect(panel.scrollTop).toBe(100)
    expect(document.querySelectorAll('section')[1].scrollTop).toBe(0)
    Object.defineProperty(panel, 'offsetHeight', { value: 100 })
    panel.getBoundingClientRect = vi.fn().mockReturnValue({ top: 20, height: 200 })
    panel.scrollTop = 0
    expect(scrollDocsAnchor(panel, '#part%3Aone')).toBe(true)
    expect(panel.scrollTop).toBe(50)
    expect(scrollDocsAnchor(panel, '#absent')).toBe(false)
    expect(scrollDocsAnchor(panel, '#%zz')).toBe(false)
  })
})
