import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoirePreview, HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, onBeforeUnmount } from 'vue'
import SearchPanel from '../../../histoire-app/src/app/components/panes/search/SearchPanel.vue'
import ShellLayout from '../../../histoire-app/src/app/components/shell/ShellLayout.vue'
import { provideShell } from '../../../histoire-app/src/app/composables/shell.js'
import { createStandaloneCommands } from '../../../histoire-app/src/app/standalone/commands.js'
import { createWorkbenchMarkdownTransition } from '../../../histoire-app/src/app/standalone/markdown-transition.js'
import { createStandaloneNavigation } from '../../../histoire-app/src/app/standalone/navigation.js'
import { createStandaloneSelection } from '../../../histoire-app/src/app/standalone/selection.js'
import { createShell, SHELL_STORAGE_KEY } from '../../../histoire-app/src/app/stores/shell.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'

vi.mock('virtual:$histoire-commands', () => ({ registeredCommands: [] }))
vi.mock('virtual:$histoire-stories', () => ({ files: [], onUpdate: () => () => {} }))

describe('narrow workbench Search dismissal', () => {
  it.each(['complete', 'docs-only', 'docs-only-primary', 'docs-only-primary-failure', 'superseded', 'superseded-error', 'query-revisited', 'source-replaced', 'owned-error', 'selection-error'])('applies Docs tab/anchor before dismissal and keeps %s activation ownership', async (activation) => {
    const docsOnly = activation.startsWith('docs-only')
    const primaryMode = activation.startsWith('docs-only-primary')
    const complete = activation === 'complete' || docsOnly
    const fixture = sourceFixture()
    const primarySelection = deferred<unknown>()
    const dispatch = fixture.request.getMockImplementation()!
    fixture.request.mockImplementation((command, payload) => command === 'catalog.search'
      ? Promise.resolve([{ target: { storyId: docsOnly ? 'docs' : 'a:b', variantId: null }, kind: activation === 'docs-only' ? 'story' : 'docs', title: 'Documentation needle', rank: 0, anchor: '#part' }])
      : primaryMode && command === 'selection.select' && payload.storyId === 'docs' ? primarySelection.promise : dispatch(command, payload))
    const core = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
    await core.connect()
    const selection = createStandaloneSelection(core)
    const navigation = createStandaloneNavigation(selection, { base: '/', mode: 'history', error: vi.fn() })
    await navigation.router.push(docsOnly ? '/story/a:b?variantId&tab=docs' : '/story/a:b?variantId=c&tab=events')
    await navigation.synchronize()
    const commands = createStandaloneCommands(selection.session, navigation.router)
    const pending = deferred<void>()
    if (!complete && activation !== 'selection-error') {
      const activateSearch = commands.activateSearch
      vi.spyOn(commands, 'activateSearch').mockImplementation(async (result) => {
        await activateSearch(result)
        await pending.promise
      })
    }
    window.localStorage.removeItem(SHELL_STORAGE_KEY)
    const shell = createShell({ dev: true, storage: window.localStorage })
    shell.setNarrow(390)
    shell.selectPane('search')
    let focusBeforeDismiss: Element | null = null
    const onSelected = vi.fn(() => {
      focusBeforeDismiss = document.activeElement
      shell.closePanelAfterSelection()
    })
    const onError = vi.fn()
    const host = defineComponent({
      setup() {
        provideShell(shell)
        const markdown = createWorkbenchMarkdownTransition(selection.session)
        onBeforeUnmount(markdown.close)
        return () => h(ShellLayout, { homeHref: '/', settingsAvailable: true }, {
          search: () => h(SearchPanel, { commands, onSelect: onSelected, onError }),
          main: primaryMode ? () => markdown.visible.value ? h('article', 'Docs') : h(HistoirePreview) : undefined,
        })
      },
    })
    const wrapper = mount(HistoireProvider, { attachTo: document.body, props: { session: selection.session }, slots: { default: () => h(host) } })
    try {
      if (primaryMode) await vi.waitFor(() => expect(core.getSnapshot().runtime.status).toBe('ready'))
      const input = wrapper.get('input[type=search]')
      await input.setValue('needle')
      input.element.focus()
      expect(document.activeElement).toBe(input.element)
      await vi.waitFor(() => expect(wrapper.find('[data-test-id=search-item]').exists()).toBe(true))
      const failure = new Error('Activation failed')
      if (activation === 'selection-error') vi.spyOn(selection.session.selection, 'select').mockRejectedValueOnce(failure)
      await wrapper.get('[data-test-id=search-item]').trigger('click')
      if (activation === 'selection-error') {
        await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure))
        expect(onSelected).not.toHaveBeenCalled()
        expect(core.getSnapshot().selection).toEqual({ storyId: 'a:b', variantId: 'c' })
        return
      }
      await vi.waitFor(() => expect(navigation.router.currentRoute.value.params.storyId).toBe(docsOnly ? 'docs' : 'a:b'))
      if (primaryMode) {
        expect(fixture.surfaceClose).not.toHaveBeenCalled()
        expect(wrapper.findComponent(HistoirePreview).exists()).toBe(true)
        expect(fixture.request).toHaveBeenCalledWith('selection.select', { storyId: 'docs', variantId: null }, expect.objectContaining({ target: { storyId: 'docs', variantId: null } }))
        if (activation === 'docs-only-primary-failure') {
          primarySelection.reject(failure)
          await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure))
          await vi.waitFor(() => expect(wrapper.find('article').exists()).toBe(true))
          expect(fixture.surfaceClose).toHaveBeenCalledOnce()
          expect(onSelected).not.toHaveBeenCalled()
          return
        }
        primarySelection.resolve({ status: 'absent', mountId: core.getSnapshot().runtime.mountId, runtimeId: null, layout: null, viewports: [], viewport: null })
      }
      await vi.waitFor(() => expect(navigation.router.currentRoute.value.query.tab).toBe('docs'))
      expect(navigation.router.currentRoute.value.hash).toBe('#part')
      if (!complete) {
        if (['superseded', 'superseded-error', 'query-revisited'].includes(activation)) await input.setValue('other query')
        if (activation === 'query-revisited') await input.setValue('needle')
        if (activation === 'source-replaced') {
          fixture.descriptor.revision = 'revision-2'
          fixture.emitCatalog()
        }
        if (activation === 'superseded') {
          pending.resolve()
          await vi.waitFor(() => expect(commands.activateSearch).toHaveResolved())
        }
        else {
          pending.reject(failure)
          await expect(pending.promise).rejects.toBe(failure)
        }
        await flushPromises()
        if (activation === 'owned-error') expect(onError).toHaveBeenCalledWith(failure)
        else expect(onError).not.toHaveBeenCalled()
        expect(onSelected).not.toHaveBeenCalled()
        expect(wrapper.find('[data-test-id=search-modal]').exists()).toBe(true)
        expect(document.activeElement).toBe(input.element)
        return
      }
      expect(onSelected).toHaveBeenCalledOnce()
      expect(focusBeforeDismiss).toBe(input.element)
      await vi.waitFor(() => expect(wrapper.find('[data-test-id=search-modal]').exists()).toBe(false))
      await vi.waitFor(() => expect(document.activeElement).toBe(wrapper.get('[data-test-id=search-btn]').element))
      if (primaryMode) expect(fixture.surfaceClose).toHaveBeenCalledOnce()
    }
    finally {
      wrapper.unmount()
      primarySelection.resolve(undefined)
      shell.close()
      commands.close()
      navigation.close()
      selection.close()
      await core.dispose()
      window.localStorage.removeItem(SHELL_STORAGE_KEY)
      window.history.replaceState({}, '', '/')
    }
  })
})
