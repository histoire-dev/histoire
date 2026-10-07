import { getHistoireIcon, histoireCarbonIcons } from '@histoire/shared/dist/icons/index.js'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BuiltinIcon from './BuiltinIcon.vue'

const iconifyMock = vi.hoisted(() => ({ addCollection: vi.fn() }))

vi.mock('@iconify/vue', async () => {
  const { defineComponent, h } = await import('vue')
  const Icon = defineComponent({
    name: 'Icon',
    props: {
      icon: { type: String, required: true },
      width: [String, Number],
      height: [String, Number],
    },
    setup(props, { attrs }) {
      return () => h('svg', {
        ...attrs,
        'data-iconify': props.icon,
        'width': props.width,
        'height': props.height,
      })
    },
  })

  return { Icon, addCollection: iconifyMock.addCollection }
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('builtin icon', () => {
  it('registers the bundled Carbon collection for direct Iconify consumers', () => {
    expect(iconifyMock.addCollection).toHaveBeenCalledWith(histoireCarbonIcons)
  })

  it.each([
    ['carbon:home', 'home'],
    ['mdi:tailwind', 'mdi:tailwind'],
  ])('renders bundled glyph %s locally without network access', (icon, canonical) => {
    const fetch = vi.fn(() => Promise.reject(new Error('Network unavailable')))
    vi.stubGlobal('fetch', fetch)

    const prefixed = mount(BuiltinIcon, { props: { icon } })
    const bare = mount(BuiltinIcon, { props: { icon: canonical } })
    const expectedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    expectedSvg.innerHTML = getHistoireIcon(canonical)?.body ?? ''

    try {
      expect(prefixed.element.tagName).toBe('svg')
      expect(prefixed.element.innerHTML).toBe(expectedSvg.innerHTML)
      expect(bare.element.innerHTML).toBe(expectedSvg.innerHTML)
      expect(fetch).not.toHaveBeenCalled()
    }
    finally {
      prefixed.unmount()
      bare.unmount()
    }
  })

  it('renders legacy aliases through the bundled Carbon glyph data', () => {
    const alias = mount(BuiltinIcon, { props: { icon: 'mdi:drag-vertical-variant' } })
    const canonical = mount(BuiltinIcon, { props: { icon: 'draggable' } })

    expect(alias.element.innerHTML).toBe(canonical.element.innerHTML)
    alias.unmount()
    canonical.unmount()
  })

  it('delegates other namespaced identifiers to Iconify', () => {
    const wrapper = mount(BuiltinIcon, {
      props: { icon: 'noto:paintbrush', size: '1.5em' },
      attrs: { 'aria-label': 'Paintbrush icon', 'data-source': 'story' },
    })

    expect(wrapper.attributes('data-iconify')).toBe('noto:paintbrush')
    expect(wrapper.attributes('width')).toBe('1.5em')
    expect(wrapper.attributes('height')).toBe('1.5em')
    expect(wrapper.attributes('aria-label')).toBe('Paintbrush icon')
    expect(wrapper.attributes('data-source')).toBe('story')
    wrapper.unmount()
  })

  it.each([
    'https://example.test/icon.svg',
    'data:image/svg+xml,%3Csvg/%3E',
    './icons/custom.svg',
    '/icons/custom.svg',
  ])('renders image source %s as an image', (icon) => {
    const wrapper = mount(BuiltinIcon, { props: { icon, size: 24 } })

    expect(wrapper.element.tagName).toBe('IMG')
    expect(wrapper.attributes('src')).toBe(icon)
    expect(wrapper.attributes('alt')).toBe(icon)
    expect(wrapper.attributes('width')).toBe('24')
    expect(wrapper.attributes('height')).toBe('24')
    wrapper.unmount()
  })

  it('lets explicit width and height override the size shorthand', () => {
    const wrapper = mount(BuiltinIcon, {
      props: { icon: 'carbon:home', size: 12, width: 20, height: '1.5em' },
    })

    expect(wrapper.attributes('width')).toBe('20px')
    expect(wrapper.attributes('height')).toBe('1.5em')
    wrapper.unmount()
  })

  it('treats an unknown bare name as a Carbon Iconify identifier', () => {
    const wrapper = mount(BuiltinIcon, { props: { icon: 'not-a-glyph' } })

    expect(wrapper.attributes('data-iconify')).toBe('carbon:not-a-glyph')
    wrapper.unmount()
  })
})
