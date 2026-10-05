// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { activeMarkdownHeading, collectMarkdownHeadings, scrollMarkdownHeading } from './outline-dom.js'

describe('page-scoped markdown outline', () => {
  it('keeps renderer IDs and h2/h3 labels, excluding decorative links and host headings', () => {
    const root = document.createElement('main')
    root.innerHTML = '<h2 id="host">Host</h2><section class="histoire-docs"><h1 id="title">Title</h1><h2 id="install">Install<a class="header-anchor">#</a></h2><h3 id="install-detail">Details</h3><h4 id="deep">Deep</h4></section>'
    expect(collectMarkdownHeadings(root).map(({ id, title, level }) => ({ id, title, level }))).toEqual([{ id: 'install', title: 'Install', level: 2 }, { id: 'install-detail', title: 'Details', level: 3 }])
  })

  it('moves owning page and tracks reading position, rejecting retired elements', () => {
    const root = document.createElement('main')
    root.innerHTML = '<section class="histoire-docs"><h2 id="first">First</h2><h2 id="second">Second</h2></section>'
    const headings = collectMarkdownHeadings(root)
    root.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    headings[0].element.getBoundingClientRect = () => ({ top: 120 }) as DOMRect
    headings[1].element.getBoundingClientRect = () => ({ top: 230 }) as DOMRect
    expect(activeMarkdownHeading(root, headings)).toBe('first')
    scrollMarkdownHeading(root, headings[1])
    expect(root.scrollTop).toBe(98)
    headings[1].element.getBoundingClientRect = () => ({ top: 180 }) as DOMRect
    expect(activeMarkdownHeading(root, headings)).toBe('second')
    headings[1].element.remove()
    scrollMarkdownHeading(root, headings[1])
    expect(root.scrollTop).toBe(98)
  })
})
