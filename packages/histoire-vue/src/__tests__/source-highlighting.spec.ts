import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h, ref } from 'vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireSource } from '../components/source/HistoireSource.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

describe('real source highlighting', () => {
  it.each([
    ['html', '<button @click="onClick($event)">Click me</button>'],
    ['vue', '<script setup lang="ts">\nconst message = "Hello"\n</script>\n<template><button>{{ message }}</button></template>'],
  ])('renders %s tokens and preserves source as inert text', async (language, body) => {
    const fixture = sourceFixture()
    const dispatch = fixture.request.getMockImplementation()!
    // Only the remote source transport is substituted; rendering and Shiki stay real.
    fixture.request.mockImplementation(async (command, payload) => command === 'source.get'
      ? { ...payload, epoch: 'epoch-1', revision: 'revision-1', origin: 'file', language, body }
      : dispatch(command, payload))
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const appearance = ref<'light' | 'dark'>('dark')
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoireSource, { appearance: appearance.value }) } })
    try {
      await expect.poll(() => wrapper.find('pre code').exists()).toBe(true)
      expect(wrapper.get('pre code').element.textContent).toBe(body)
      expect(wrapper.findAll('code > span > span').length).toBeGreaterThan(1)
      expect(wrapper.find('script, button[onclick]').exists()).toBe(false)
      const panel = wrapper.getComponent(HistoireSource)
      const publications = panel.emitted('content')!.length
      appearance.value = 'light'
      await expect.poll(() => panel.emitted('content')?.length).toBe(publications + 1)
      await expect.poll(() => wrapper.find('pre code').element?.textContent).toBe(body)
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    }
    finally {
      wrapper.unmount()
      await session.dispose()
    }
  })
})
