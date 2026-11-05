import { mount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import MatchText from '../../../../histoire-app/src/app/components/marketplace/browse/MatchText.vue'

it('renders overlapping inclusive matches once and keeps catalog text inert', () => {
  const wrapper = mount(MatchText, { props: { text: '<img> Audit', ranges: [[8, 10], [6, 8], [0, 4]] } })
  try {
    expect(wrapper.text()).toBe('<img> Audit')
    expect(wrapper.findAll('mark').map(mark => mark.text())).toEqual(['<img>', 'Audit'])
    expect(wrapper.find('img').exists()).toBe(false)
  }
  finally { wrapper.unmount() }
})
