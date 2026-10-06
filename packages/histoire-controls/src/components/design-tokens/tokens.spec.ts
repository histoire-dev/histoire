import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HstColorShades from './HstColorShades.vue'
import HstTokenGrid from './HstTokenGrid.vue'
import HstTokenList from './HstTokenList.vue'

describe('token browsing', () => {
  it.each([HstTokenGrid, HstTokenList])('filters literal text and structured values with mounted copy actions', async (component) => {
    const wrapper = mount(component, { props: { tokens: { 'brand[': ['12px', { lineHeight: '1.5' }], 'plain': 12 }, search: '[' } })
    try {
      expect(wrapper.text()).toContain('brand[')
      expect(wrapper.text()).not.toContain('plain')
      expect(wrapper.findAll('button').map(button => button.attributes('aria-label'))).toEqual(['Copy token name', 'Copy token value'])
      await wrapper.setProps({ search: 'LINEHEIGHT' })
      expect(wrapper.text()).toContain('brand[')
    }
    finally { wrapper.unmount() }
  })

  it('flattens nested DEFAULT colors and searches literal values', () => {
    const wrapper = mount(HstColorShades, { props: { shades: { brand: { DEFAULT: '#AbCdEf', 500: '#123456' } }, search: '#abcdef' } })
    try {
      expect(wrapper.text()).toContain('brand')
      expect(wrapper.text()).not.toContain('brand-500')
      expect(wrapper.findAll('button').map(button => button.attributes('aria-label'))).toEqual(['Copy color name', 'Copy color value'])
    }
    finally { wrapper.unmount() }
  })
})
