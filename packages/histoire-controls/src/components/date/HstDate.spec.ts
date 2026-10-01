import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HstDate from './HstDate.vue'

describe('hstDate', () => {
  describe('basic functionality', () => {
    it('renders with modelValue', () => {
      const wrapper = mount(HstDate, {
        props: {
          modelValue: new Date('2024-12-25'),
        },
      })

      const input = wrapper.find('input')
      expect(input.element.value).toBe('2024-12-25')
    })

    it('renders title', () => {
      const wrapper = mount(HstDate, {
        props: {
          title: 'Select Date',
        },
      })

      const hstWrapper = wrapper.findComponent({ name: 'HstWrapper' })
      expect(hstWrapper.exists()).toBe(true)
      expect(hstWrapper.props('title')).toBe('Select Date')
    })
  })

  describe('input handling', () => {
    it('emits update:modelValue and update:dateString on input', async () => {
      const wrapper = mount(HstDate, {
        props: {
          modelValue: null,
        },
      })

      const input = wrapper.find('input')
      input.element.value = '2024-12-25'
      await input.trigger('input')

      expect(wrapper.emitted('update:dateString')).toHaveLength(1)
      expect(wrapper.emitted('update:dateString')?.[0]).toEqual(['2024-12-25'])

      expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
      const emittedDate = wrapper.emitted('update:modelValue')?.[0][0] as Date
      expect(emittedDate).toBeInstanceOf(Date)
      expect(emittedDate.toISOString()).toMatchInlineSnapshot('"2024-12-25T00:00:00.000Z"')
    })

    it('emits empty string and null when clearing input', async () => {
      const wrapper = mount(HstDate, {
        props: {
          modelValue: new Date('2024-12-25'),
        },
      })

      const input = wrapper.find('input')
      input.element.value = ''
      await input.trigger('input')

      expect(wrapper.emitted('update:dateString')).toHaveLength(1)
      expect(wrapper.emitted('update:dateString')?.[0]).toEqual([''])

      expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null])
    })
  })

  describe('datetime prop', () => {
    it('uses datetime-local input type when datetime is true', () => {
      const wrapper = mount(HstDate, {
        props: {
          datetime: true,
          modelValue: new Date('2024-12-25T14:30'),
        },
      })
      const input = wrapper.find('input')
      expect(input.element.type).toBe('datetime-local')
    })

    it('formats datetime-local correctly', () => {
      const wrapper = mount(HstDate, {
        props: {
          datetime: true,
          modelValue: new Date('2024-12-25T14:30:00.000Z'),
        },
      })
      const input = wrapper.find('input')
      expect(input.element.value).toMatchInlineSnapshot('"2024-12-25T14:30"')
    })

    it('uses date input type when datetime is false', () => {
      const wrapper = mount(HstDate, {
        props: {
          datetime: false,
          modelValue: new Date('2024-12-25'),
        },
      })
      const input = wrapper.find('input')
      expect(input.element.type).toBe('date')
    })
  })

  describe('modelValue initialization', () => {
    it('initializes input from modelValue', () => {
      const wrapper = mount(HstDate, {
        props: {
          modelValue: new Date('2024-12-25'),
        },
      })

      const input = wrapper.find('input')
      expect(input.element.value).toBe('2024-12-25')
    })

    it('initializes with empty string when modelValue is null', () => {
      const wrapper = mount(HstDate, {
        props: {
          modelValue: null,
        },
      })

      const input = wrapper.find('input')
      expect(input.element.value).toBe('')
    })
  })

  describe('input change emissions', () => {
    it('emits both dateString and modelValue on input change', async () => {
      const wrapper = mount(HstDate, {
        props: {
          modelValue: new Date('2024-12-25'),
        },
      })

      const input = wrapper.find('input')
      input.element.value = '2024-12-26'
      await input.trigger('input')

      expect(wrapper.emitted('update:dateString')).toHaveLength(1)
      expect(wrapper.emitted('update:dateString')?.[0]).toEqual(['2024-12-26'])

      expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
      const emittedDate = wrapper.emitted('update:modelValue')?.[0][0] as Date
      expect(emittedDate.toISOString()).toMatchInlineSnapshot('"2024-12-26T00:00:00.000Z"')
    })

    it('emits with valid date string', async () => {
      const wrapper = mount(HstDate, {
        props: {
          modelValue: null,
        },
      })

      const input = wrapper.find('input')
      input.element.value = '2024-12-20'
      await input.trigger('input')

      expect(wrapper.emitted('update:dateString')).toHaveLength(1)
      expect(wrapper.emitted('update:dateString')?.[0]).toEqual(['2024-12-20'])

      expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
      const emittedDate = wrapper.emitted('update:modelValue')?.[0][0] as Date
      expect(emittedDate.toISOString()).toMatchInlineSnapshot('"2024-12-20T00:00:00.000Z"')
    })
  })

  describe('edge cases', () => {
    it('handles null modelValue', () => {
      const wrapper = mount(HstDate, {
        props: {
          modelValue: null,
        },
      })
      const input = wrapper.find('input')
      expect(input.element.value).toBe('')
    })

    it('handles undefined modelValue', () => {
      const wrapper = mount(HstDate, {
        props: {},
      })
      const input = wrapper.find('input')
      expect(input.element.value).toBe('')
    })

    it('emits empty string and null for empty input', async () => {
      const wrapper = mount(HstDate, {
        props: {
          modelValue: null,
        },
      })
      const input = wrapper.find('input')
      input.element.value = ''
      await input.trigger('input')

      expect(wrapper.emitted('update:dateString')).toHaveLength(1)
      expect(wrapper.emitted('update:dateString')?.[0]).toEqual([''])

      expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null])
    })
  })

  describe('attributes and styling', () => {
    it('accepts and applies arbitrary attributes', () => {
      const wrapper = mount(HstDate, {
        props: {
          modelValue: null,
        },
        attrs: {
          placeholder: 'Pick a date',
        },
      })

      const input = wrapper.find('input')
      expect(input.element.placeholder).toBe('Pick a date')
    })
  })

  describe('slot support', () => {
    it('renders actions slot', () => {
      const wrapper = mount(HstDate, {
        props: {
          modelValue: null,
        },
        slots: {
          actions: '<button>Clear</button>',
        },
      })

      expect(wrapper.html()).toContain('<button>Clear</button>')
    })
  })
})
