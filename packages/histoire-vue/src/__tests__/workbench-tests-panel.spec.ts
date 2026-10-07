import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, reactive } from 'vue'
import { createWorkbenchTestsModel, provideWorkbenchTestsModel } from '../../../histoire-app/src/app/components/panes/tests/model.js'
import TestsPanel from '../../../histoire-app/src/app/components/panes/tests/TestsPanel.vue'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

/** Mounts the project Tests pane with its real shared watch-setting owner. */
async function mountPanel(runnable: boolean) {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  const state = reactive({ watchTests: false })
  const update = vi.fn((patch: { watchTests: boolean }) => Object.assign(state, patch))
  const model = createWorkbenchTestsModel(session, undefined, {
    settings: { state, update },
    ...(runnable ? { run: vi.fn() } : {}),
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
