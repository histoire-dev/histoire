import type { HistoireProjectTestCollectionResult } from '@histoire/protocol'
import type { WorkbenchTestsOptions } from '../../../histoire-app/src/app/components/panes/tests/types.js'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { createWorkbenchTestsModel, provideWorkbenchTestsModel } from '../../../histoire-app/src/app/components/panes/tests/model.js'
import TestsPanel from '../../../histoire-app/src/app/components/panes/tests/TestsPanel.vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

/** Mounts the project Tests pane with its real shared watch-setting owner. */
async function mountPanel(runnable: boolean, options: WorkbenchTestsOptions = {}) {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  const state = reactive({ watchTests: false })
  const update = vi.fn((patch: { watchTests: boolean }) => Object.assign(state, patch))
  const model = createWorkbenchTestsModel(session, undefined, {
    settings: { state, update },
    ...(runnable ? { run: vi.fn() } : {}),
    ...options,
  })
  const host = defineComponent({
    setup() {
      provideWorkbenchTestsModel(model)
      return () => h(TestsPanel)
    },
  })
  const wrapper = mount(HistoireProvider, {
    attachTo: document.body,
    props: { session },
    slots: { default: () => h(host) },
  })
  return {
    model,
    state,
    update,
    wrapper,
    /** Discovery acknowledges every executable target, including empty variants. */
    collection(tested = false): HistoireProjectTestCollectionResult {
      const source = session.getSnapshot().source!
      return {
        execution: { runId: 'loading-test', mode: 'server', sourceId: source.sourceId, epoch: source.epoch, revision: source.revision },
        variants: fixture.descriptor.catalog.stories.filter(story => !story.docsOnly).flatMap(story => story.variants.map(variant => ({
          target: { storyId: story.id, variantId: variant.id },
          collection: { definitions: tested && variant.id === 'c' ? [{ id: '0', name: 'test', fullName: 'test' }] : [] },
        }))),
      }
    },
    /** Releases every resource created for this mounted pane. */
    async close() {
      wrapper.unmount()
      model.close()
      await session.dispose()
    },
  }
}

describe('workbench Tests pane watch mode', () => {
  it('toggles Watch mode from its whole row without duplicating switch updates', async () => {
    const test = await mountPanel(true)
    try {
      const row = test.wrapper.get('footer label')
      const input = row.get('input[role="switch"]')

      expect((input.element as HTMLInputElement).checked).toBe(false)
      row.element.click()
      await nextTick()
      expect(test.state.watchTests).toBe(true)
      expect((input.element as HTMLInputElement).checked).toBe(true)
      expect(test.update).toHaveBeenCalledExactlyOnceWith({ watchTests: true })

      await input.setValue(false)
      expect(test.state.watchTests).toBe(false)
      expect(test.update).toHaveBeenLastCalledWith({ watchTests: false })
      expect(test.update).toHaveBeenCalledTimes(2)
    }
    finally {
      await test.close()
    }
  })

  it('keeps Watch mode unavailable when tests cannot run', async () => {
    const test = await mountPanel(false)
    try {
      const row = test.wrapper.get('footer label')
      const input = row.get('input[role="switch"]')

      expect((input.element as HTMLInputElement).disabled).toBe(true)
      row.element.click()
      await nextTick()
      expect(test.state.watchTests).toBe(false)
      expect(test.update).not.toHaveBeenCalled()
    }
    finally {
      await test.close()
    }
  })
})

describe('workbench Tests pane loading', () => {
  it.each([false, true])('replaces deferred discovery with settled content (tests: %s)', async (tested) => {
    const gate = deferred<HistoireProjectTestCollectionResult>()
    const again = deferred<HistoireProjectTestCollectionResult>()
    const collectProject = vi.fn().mockReturnValueOnce(gate.promise).mockReturnValueOnce(again.promise)
    const test = await mountPanel(true, { collectProject })
    try {
      await vi.waitFor(() => expect(test.wrapper.get('[role="status"][aria-atomic="true"]').text()).toBe('Collecting tests…'))
      gate.resolve(test.collection(tested))
      await vi.waitFor(() => expect(test.model.discoveryStatus.value).toBe('completed'))
      await nextTick()
      expect(test.wrapper.find('[role="status"][aria-atomic="true"]').exists()).toBe(false)
      expect(test.wrapper.text()).toContain(tested ? 'No failing tests' : 'No tests')
      if (tested) {
        const tree = test.wrapper.get('[aria-label="Project tests"]').element
        test.model.retryCollection()
        await vi.waitFor(() => expect(test.model.discoveryStatus.value).toBe('collecting'))
        await nextTick()
        expect(test.wrapper.find('[role="status"][aria-atomic="true"]').exists()).toBe(false)
        expect(test.wrapper.get('[aria-label="Project tests"]').element).toBe(tree)
        expect(test.model.visibleRows.value).toHaveLength(1)
        again.resolve(test.collection())
      }
    }
    finally {
      gate.resolve(test.collection())
      again.resolve(test.collection())
      await test.close()
    }
  })

  it('retires loading on discovery failure and keeps retry actionable', async () => {
    const gate = deferred<HistoireProjectTestCollectionResult>()
    const again = deferred<HistoireProjectTestCollectionResult>()
    const pending = [gate.promise, again.promise]
    const test = await mountPanel(true, { collectProject: () => pending.shift()! })
    try {
      await vi.waitFor(() => expect(test.wrapper.find('[role="status"][aria-atomic="true"]').exists()).toBe(true))
      gate.reject(new Error('Collection unavailable'))
      await vi.waitFor(() => expect(test.wrapper.get('[role="alert"] p').text()).toBe('Collection unavailable'))
      expect(test.wrapper.get('[role="alert"] strong').text()).toBe('Test collection failed')
      expect(test.wrapper.find('[role="status"][aria-atomic="true"]').exists()).toBe(false)
      const retry = test.wrapper.get('[role="alert"] button')
      expect(retry.text()).toBe('Retry collection')
      await retry.trigger('click')
      await vi.waitFor(() => expect(test.wrapper.find('[role="status"][aria-atomic="true"]').exists()).toBe(true))
      expect(test.wrapper.find('[role="alert"]').exists()).toBe(false)
      again.resolve(test.collection(true))
      await vi.waitFor(() => expect(test.wrapper.find('[aria-label="Project tests"]').exists()).toBe(true))
      expect(test.wrapper.find('[role="status"][aria-atomic="true"]').exists()).toBe(false)
    }
    finally {
      again.resolve(test.collection(true))
      await test.close()
    }
  })
})
