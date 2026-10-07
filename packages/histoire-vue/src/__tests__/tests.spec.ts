import type { HistoireTestCollectionResult, HistoireTestRunSummary } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk'
import type { VueWrapper } from '@vue/test-utils'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoireTests } from '../components/tests/HistoireTests.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'
import { createHistoireTestsController } from '../tests/controller.js'

/** Existing SDK fixture proves independent native panel uses only explicit provider session. */
async function fixture() {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  return { fixture, session }
}

/** Opens compact test command menu and invokes one named action. */
async function chooseTestAction(wrapper: VueWrapper, label: string): Promise<void> {
  await wrapper.get('button[aria-label="More test actions"]').trigger('click')
  await vi.waitFor(() => expect(wrapper.find('[role="menu"]').exists()).toBe(true))
  const action = wrapper.findAll<HTMLButtonElement>('[role="menuitem"]').find(button => button.text() === label)
  if (!action) throw new Error(`Missing test action: ${label}`)
  await action.trigger('click')
}

describe('independent tests panel', () => {
  it('mounts data-only, exposes grouped commands and treats assertions as completed result', async () => {
    const test = await fixture()
    const summary = { ok: false, total: 1, passed: 0, failed: 1, skipped: 0, errors: [], tests: [{ id: 'failed', name: 'assertion', fullName: 'assertion', state: 'failed' as const, errors: [{ message: 'expected true', diff: '- false\n+ true', stack: 'Button.story.vue:12\n  expect(value).toBe(true)' }] }] }
    const run = vi.spyOn(test.session.tests, 'run').mockResolvedValue(summary)
    const collect = vi.spyOn(test.session.tests, 'collect')
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireTests) } })
    expect(run).not.toHaveBeenCalled()
    expect(collect).not.toHaveBeenCalled()
    expect(wrapper.get('[role="group"][aria-label="Test actions"]').text()).toContain('Run')
    expect(wrapper.text()).not.toContain('Collect')
    expect(wrapper.text()).not.toContain('preview')
    await chooseTestAction(wrapper, 'Run on server')
    await vi.waitFor(() => expect(wrapper.get('output').text()).toBe('0 passed · 1 failed · 0 skipped'))
    expect(run.mock.calls[0][0].mode).toBe('server')
    expect(wrapper.get('summary').text()).toBe('expected true')
    expect(wrapper.get('[aria-label="Assertion difference"]').text()).toBe('- false\n+ true')
    expect(wrapper.get('[aria-label="Error stack and source excerpt"]').text()).toContain('Button.story.vue:12')
    wrapper.unmount()
    expect(test.session.getSnapshot().status).toBe('ready')
    await test.session.dispose()
  })

  it('runs in canvas by default and force refreshes definitions without running assertions', async () => {
    const test = await fixture()
    const summary = { ok: true, total: 1, passed: 1, failed: 0, skipped: 0, errors: [], tests: [{ id: 'passed', name: 'assertion', fullName: 'assertion', state: 'passed' as const, errors: [] }] }
    const collection = { definitions: [{ id: 'definition', name: 'definition', fullName: 'definition' }] }
    const run = vi.spyOn(test.session.tests, 'run').mockResolvedValue(summary)
    const collect = vi.spyOn(test.session.tests, 'collect').mockResolvedValue(collection)
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireTests) } })
    const canvas = test.session.mount(document.createElement('div'), { surface: 'preview' })
    try {
      await canvas.ready
      await nextTick()
      await wrapper.get('button[aria-label="Run tests"]').trigger('click')
      await vi.waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({ mode: 'preview' })))
      expect(collect).not.toHaveBeenCalled()
      await chooseTestAction(wrapper, 'Force refresh')
      await vi.waitFor(() => expect(collect).toHaveBeenCalledOnce())
      expect(run).toHaveBeenCalledOnce()
      expect(wrapper.get('output').text()).toBe('1 collected')
    }
    finally {
      wrapper.unmount()
      await canvas.unmount()
      await test.session.dispose()
    }
  })

  it('navigates split commands and restores trigger focus on dismissal', async () => {
    const test = await fixture()
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireTests) }, attachTo: document.body })
    const canvas = test.session.mount(document.createElement('div'), { surface: 'preview' })
    try {
      await canvas.ready
      await nextTick()
      const trigger = wrapper.get('button[aria-label="More test actions"]')
      await trigger.trigger('keydown', { key: 'ArrowUp' })
      await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Force refresh'))
      const menu = wrapper.get('[role="menu"]')
      await menu.trigger('keydown', { key: 'ArrowUp' })
      expect(document.activeElement?.textContent).toBe('Run on server')
      await menu.trigger('keydown', { key: 'End' })
      expect(document.activeElement?.textContent).toBe('Force refresh')
      await menu.trigger('keydown', { key: 'Home' })
      expect(document.activeElement?.textContent).toBe('Run on server')
      await menu.trigger('keydown', { key: 'Escape' })
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(trigger.element)
    }
    finally {
      wrapper.unmount()
      await canvas.unmount()
      await test.session.dispose()
    }
  })

  it('cancels exact run and ignores late results after navigation', async () => {
    const test = await fixture()
    const result = deferred<any>()
    let signal: AbortSignal | undefined
    vi.spyOn(test.session.tests, 'run').mockImplementation((options) => {
      signal = options.signal
      return result.promise
    })
    const publish = vi.fn()
    const controller = createHistoireTestsController(test.session as HistoireSession, publish)
    const operation = controller.run('server')
    expect(signal?.aborted).toBe(false)
    await test.session.selection.select({ storyId: 'a', variantId: 'b:c' })
    expect(signal?.aborted).toBe(true)
    result.resolve({ ok: true, total: 0, passed: 0, failed: 0, skipped: 0, errors: [], tests: [] })
    await operation
    expect(publish.mock.lastCall?.[0]).toMatchObject({ status: 'idle', summary: null })
    controller.close()
    await test.session.dispose()
  })

  it('displays host-attributed cached failure without starting another run', async () => {
    const test = await fixture()
    const summary = { ok: false, total: 1, passed: 0, failed: 1, skipped: 0, errors: [], tests: [{ id: 'cached', name: 'cached assertion', fullName: 'cached assertion', state: 'failed' as const, errors: ['cached failure'] }] }
    const run = vi.spyOn(test.session.tests, 'run')
    const collect = vi.spyOn(test.session.tests, 'collect')
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireTests, { summary }) } })
    expect(wrapper.get('output').text()).toBe('0 passed · 1 failed · 0 skipped')
    expect(wrapper.get('summary').text()).toBe('cached failure')
    expect(run).not.toHaveBeenCalled()
    expect(collect).not.toHaveBeenCalled()
    wrapper.unmount()
    await test.session.dispose()
  })

  it('does not emit late completion into replacement selection', async () => {
    const test = await fixture()
    const result = deferred<any>()
    vi.spyOn(test.session.tests, 'run').mockReturnValue(result.promise)
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireTests) } })
    const panel = wrapper.findComponent(HistoireTests)
    await chooseTestAction(wrapper, 'Run on server')
    await test.session.selection.select({ storyId: 'a', variantId: 'b:c' })
    result.resolve({ ok: true, total: 0, passed: 0, failed: 0, skipped: 0, errors: [], tests: [] })
    await result.promise
    await Promise.resolve()
    expect(panel.emitted('completed')).toBeUndefined()
    expect(panel.get('output').text()).toBe('idle')
    wrapper.unmount()
    await test.session.dispose()
  })
  it('shows host definitions and live execution, then replaces a retired local failure with cached results', async () => {
    const test = await fixture()
    const cached = ref<{ collection?: HistoireTestCollectionResult, running?: boolean, summary?: HistoireTestRunSummary }>({})
    const run = vi.spyOn(test.session.tests, 'run').mockRejectedValue(new Error('Old transport failure'))
    const collect = vi.spyOn(test.session.tests, 'collect')
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireTests, cached.value) } })
    const panel = wrapper.findComponent(HistoireTests)
    try {
      await chooseTestAction(wrapper, 'Run on server')
      await vi.waitFor(() => expect(panel.get('[role="alert"]').text()).toBe('Old transport failure'))
      const collection = { definitions: [{ id: 'cached', name: 'Cached test', fullName: 'Suite > Cached test' }] }
      cached.value = { collection, running: true }
      await nextTick()
      expect(panel.get('output').text()).toBe('running')
      expect(panel.text()).toContain('Suite > Cached test — Not run')
      expect(panel.find('[role="alert"]').exists()).toBe(false)
      expect(panel.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
      cached.value = { collection, running: false, summary: { ok: true, total: 1, passed: 1, failed: 0, skipped: 0, errors: [], tests: [{ id: 'cached', name: 'Cached test', fullName: 'Suite > Cached test', state: 'passed', errors: [] }] } }
      await nextTick()
      expect(panel.get('output').text()).toBe('1 passed · 0 failed · 0 skipped')
      expect(panel.text()).toContain('Suite > Cached test — passed')
      expect(panel.find('[role="alert"]').exists()).toBe(false)
      expect(run).toHaveBeenCalledOnce()
      expect(collect).not.toHaveBeenCalled()
    }
    finally {
      wrapper.unmount()
      await test.session.dispose()
    }
  })
  it('lets a newer explicit local run replace a static host cache until another host result arrives', async () => {
    const test = await fixture()
    const old = { ok: true, total: 0, passed: 0, failed: 0, skipped: 0, errors: [], tests: [] }
    const cached = ref<HistoireTestRunSummary>(old)
    const fresh = { ok: false, total: 1, passed: 0, failed: 1, skipped: 0, errors: [], tests: [{ id: 'fresh', name: 'Fresh test', fullName: 'Fresh test', state: 'failed' as const, errors: ['Fresh failure'] }] }
    vi.spyOn(test.session.tests, 'run').mockResolvedValue(fresh)
    const wrapper = mount(HistoireProvider, { props: { session: test.session }, slots: { default: () => h(HistoireTests, { summary: cached.value }) } })
    const panel = wrapper.findComponent(HistoireTests)
    try {
      expect(panel.get('output').text()).toBe('0 passed · 0 failed · 0 skipped')
      await chooseTestAction(wrapper, 'Run on server')
      await vi.waitFor(() => expect(panel.get('output').text()).toBe('0 passed · 1 failed · 0 skipped'))
      expect(panel.get('summary').text()).toBe('Fresh failure')
      cached.value = { ok: true, total: 1, passed: 1, failed: 0, skipped: 0, errors: [], tests: [{ id: 'host', name: 'Host test', fullName: 'Host test', state: 'passed', errors: [] }] }
      await nextTick()
      expect(panel.get('output').text()).toBe('1 passed · 0 failed · 0 skipped')
      expect(panel.text()).toContain('Host test — passed')
    }
    finally {
      wrapper.unmount()
      await test.session.dispose()
    }
  })
})
