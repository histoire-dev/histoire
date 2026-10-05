// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { scrollDocsAnchor } from '../components/docs/anchors.js'

describe('documentation scroll ownership', () => {
  it('moves explicitly marked docs page without resolving outside renderer root', () => {
    const page = document.createElement('main')
    page.setAttribute('data-histoire-docs-scroll', '')
    page.innerHTML = '<h2 id="outside">Outside</h2><section class="histoire-docs"><h2 id="part">Part</h2></section>'
    const renderer = page.querySelector('section')!
    page.getBoundingClientRect = () => ({ top: 20, height: 300 }) as DOMRect
    renderer.querySelector<HTMLElement>('h2')!.getBoundingClientRect = () => ({ top: 120 }) as DOMRect
    expect(scrollDocsAnchor(renderer, '#outside')).toBe(false)
    expect(scrollDocsAnchor(renderer, '#part')).toBe(true)
    expect(page.scrollTop).toBe(100)
    expect(renderer.scrollTop).toBe(0)
  })

  it('keeps unmarked native docs panel as sole scrolling owner', () => {
    const renderer = document.createElement('section')
    renderer.innerHTML = '<h2 id="part">Part</h2>'
    renderer.getBoundingClientRect = () => ({ top: 40, height: 200 }) as DOMRect
    renderer.querySelector<HTMLElement>('h2')!.getBoundingClientRect = () => ({ top: 100 }) as DOMRect
    expect(scrollDocsAnchor(renderer, '#part')).toBe(true)
    expect(renderer.scrollTop).toBe(60)
  })
})
