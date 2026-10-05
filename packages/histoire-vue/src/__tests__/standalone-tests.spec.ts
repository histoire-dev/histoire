import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createStandaloneTests } from '../../../histoire-app/src/app/standalone/tests.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { ExplorerPanels } from '../components/explorer/ExplorerPanels.js'
import { HistoireTests } from '../components/tests/HistoireTests.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { createHistoireTestsModel, provideHistoireTestsModel } from '../tests/model.js'

describe('standalone shared test collection', () => {
  it('collects only ready primary, shares badge/panel, isolates nested session and never runs automatically', async () => {
    const fixtures = [sourceFixture(), sourceFixture()]
    const sessions = fixtures.map(fixture => createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters))
    await Promise.all(sessions.map(session => session.connect()))
    await sessions[0].selection.select({ storyId: 'a:b', variantId: 'c' })
    const collect = vi.spyOn(sessions[0].tests, 'collect').mockResolvedValue({ definitions: [{ id: 'run', name: 'Run', fullName: 'Run' }, { id: 'skip', name: 'Skipped', fullName: 'Skipped', mode: 'skip' }] })
    const otherCollect = vi.spyOn(sessions[1].tests, 'collect')
    const run = vi.spyOn(sessions[0].tests, 'run')
    const model = createHistoireTestsModel(sessions[0])
    const adapter = createStandaloneTests(sessions[0], model)
    expect(collect).not.toHaveBeenCalled()
    expect(fixtures[0].adapters.mount).not.toHaveBeenCalled()
    const preview = sessions[0].mount(document.createElement('div'), { surface: 'preview' })
    await preview.ready
    await vi.waitFor(() => expect(model.state.value.collection?.definitions).toHaveLength(2))
    const scope = defineComponent({ setup() {
      provideHistoireTestsModel(model)
      return () => h(HistoireProvider, { session: sessions[0] }, { default: () => [h(ExplorerPanels, { activePanel: 'tests' }), h(HistoireProvider, { session: sessions[1] }, { default: () => h(HistoireTests) })] })
    } })
    const wrapper = mount(scope)
    expect(wrapper.get('[aria-label="Collected tests"]').text()).toBe('2')
    const panels = wrapper.findAllComponents(HistoireTests)
    expect(panels[0].text()).toContain('2 collected')
    expect(panels[0].text()).toContain('Run — Not run')
    expect(panels[0].text()).toContain('Skipped — Skipped')
    expect(panels[1].get('output').text()).toBe('idle')
    expect(otherCollect).not.toHaveBeenCalled()
    await sessions[0].state.patch({ count: 8 })
    expect(collect).toHaveBeenCalledOnce()
    expect(run).not.toHaveBeenCalled()
    wrapper.unmount()
    // Switching tabs destroys panel, but standalone still owns model.
    await model.controller.collect()
    expect(collect).toHaveBeenCalledTimes(2)
    adapter.close()
    adapter.close()
    await preview.unmount()
    await Promise.all(sessions.map(session => session.dispose()))
  })

  it('observes failed collection once and closes shared controller without automatic retry', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const collect = vi.spyOn(session.tests, 'collect').mockRejectedValue(new Error('Collection failed'))
    const model = createHistoireTestsModel(session)
    const adapter = createStandaloneTests(session, model)
    const preview = session.mount(document.createElement('div'), { surface: 'preview' })
    await preview.ready
    await vi.waitFor(() => expect(model.state.value.status).toBe('failed'))
    await session.settings.update({ textDirection: 'rtl' })
    expect(collect).toHaveBeenCalledOnce()
    adapter.close()
    await expect(model.controller.collect()).rejects.toMatchObject({ code: 'DISPOSED' })
    await preview.unmount()
    await session.dispose()
  })

  it('recollects an unchanged target after same-document readiness retires and returns', async () => {
    const fixture = sourceFixture()
    const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await session.connect()
    await session.selection.select({ storyId: 'a:b', variantId: 'c' })
    const collect = vi.spyOn(session.tests, 'collect').mockResolvedValue({ definitions: [{ id: 'run', name: 'Run', fullName: 'Run' }] })
    const model = createHistoireTestsModel(session)
    const adapter = createStandaloneTests(session, model)
    const preview = session.mount(document.createElement('div'), { surface: 'preview' })
    try {
      await preview.ready
      await vi.waitFor(() => expect(collect).toHaveBeenCalledOnce())
      for (const listener of fixture.frameListeners) listener({ type: 'runtime', ...fixture.owner(), runtime: { ...fixture.runtime(), status: 'mounting' } })
      fixture.ready()
      await vi.waitFor(() => expect(collect).toHaveBeenCalledTimes(2))
      expect(model.state.value.collection?.definitions).toHaveLength(1)
    }
    finally {
      adapter.close()
      await preview.unmount()
      await session.dispose()
    }
  })
})
