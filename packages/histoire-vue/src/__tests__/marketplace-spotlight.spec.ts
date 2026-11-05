import type { JobState } from '../../../histoire-shared/src/index.js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushMicrotasks } from '../../../histoire/src/node/__tests__/utils/flush.js'
import { memoryStorage } from '../../../histoire/src/node/__tests__/utils/settings-storage.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'
import { job } from './marketplace-install/fixtures.js'
import { accessibility, cleanups, setup } from './marketplace-spotlight/fixtures.js'
import { stubMarketplaceSession } from './utils/marketplace-transport.js'

vi.mock('virtual:$histoire-config', () => ({ installedPlugins: [{ packageName: '@histoire/plugin-a11y', id: 'a11y' }] }))
beforeEach(() => {
  stubMarketplaceSession()
  vi.stubGlobal('localStorage', memoryStorage())
  resizeObserverFixture()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(30, 40, 80, 32))
})
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('tours actual tab then pane, associates each anchor and restores focus after Got it', async () => {
  const { wrapper, deliver, button, opener } = await setup()
  await deliver()
  const card = wrapper.get('[role="dialog"]')
  expect(card.attributes('aria-label')).toBe('Plugin added')
  expect(card.text()).toContain('A11y tab added')
  expect(card.text()).toContain('Live accessibility audits')
  expect(card.text()).toContain('1 / 2')
  expect(card.element.contains(document.activeElement)).toBe(true)
  expect(wrapper.get('[role="tab"]').attributes('aria-details')).toBe(card.attributes('id'))
  await button('Next').trigger('click')
  expect(card.text()).toContain('Audit results pane added')
  expect(card.text()).toContain('2 / 2')
  expect(wrapper.get('[role="tab"]').attributes('aria-details')).toBeUndefined()
  expect(wrapper.get('[data-shell-pane="a11y:results"]').attributes('aria-details')).toBe(card.attributes('id'))
  await button('Got it').trigger('click')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(document.activeElement).toBe(opener)
  expect(wrapper.get('[data-shell-pane="a11y:results"]').attributes('aria-details')).toBeUndefined()
})

it('persists acknowledgement across fresh host owners for same receipt, permits next install', async () => {
  const first = await setup()
  await first.deliver()
  await first.button('Got it').trigger('click')
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  stubMarketplaceSession()
  const second = await setup()
  await second.deliver()
  expect(second.wrapper.find('[role="dialog"]').exists()).toBe(false)
  await second.deliver({ jobId: 'job-2' })
  expect(second.wrapper.get('[role="dialog"]').text()).toContain('A11y tab added')
})

it('skips missing or hidden anchors without touring another plugin', async () => {
  const { wrapper, deliver } = await setup()
  wrapper.get('[role="tab"]').element.setAttribute('hidden', '')
  await deliver({ contributions: [{ kind: 'rail-pane', id: 'other:results', label: 'Wrong' }] })
  expect(wrapper.get('[role="dialog"]').text()).toContain('Audit results pane added')
  expect(wrapper.get('[role="dialog"]').text()).toContain('1 / 1')
  expect(wrapper.get('[role="dialog"]').text()).not.toContain('Wrong')
})

it('offers settings when no anchors exist and acknowledges fallback', async () => {
  const { wrapper, deliver, button, targets } = await setup({ anchors: [] })
  await deliver()
  expect(wrapper.get('[role="dialog"]').text()).toContain('Accessibility installed')
  await button('Open settings').trigger('click')
  expect(targets.settings).toHaveBeenCalledExactlyOnceWith('plugins')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
})

it('escape dismisses, returns focus and never redisplays same receipt', async () => {
  const { wrapper, deliver, opener } = await setup()
  await deliver()
  wrapper.get<HTMLButtonElement>('[role="tab"]').element.focus()
  await wrapper.get('[role="tab"]').trigger('keydown', { key: 'Escape' })
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(document.activeElement).toBe(opener)
  await deliver()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
})

it('waits for successful load and excludes updates and already-installed option changes', async () => {
  const { wrapper, deliver } = await setup()
  for (const override of [{ status: 'running' }, { steps: [{ id: 'load', state: 'pending' }] }, { kind: 'update' }, { kind: 'options' }] as Partial<JobState>[]) {
    await deliver(override)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  }
  await deliver()
  expect(wrapper.get('[role="dialog"]').text()).toContain('A11y tab added')
})

it('opens opted-in actual pane before spotlight, then acknowledges on dismissal', async () => {
  const { wrapper, deliver, button, targets, store } = await setup({ openPane: 'Project results with story tests or build reports' })
  await deliver()
  expect(targets.pane).toHaveBeenCalledExactlyOnceWith('a11y:results')
  expect(wrapper.get('[role="dialog"]').text()).toContain('Audit results pane added')
  expect(store.open.value).toBe(false)
  expect(store.postInstall.value?.jobId).toBe('job-1')
  await button('Got it').trigger('click')
  expect(store.postInstall.value).toBeUndefined()
})

it('runs only explicit registered toolbar command through host action runner', async () => {
  const { deliver, button, actions } = await setup({ anchors: ['toolbar'] })
  await deliver()
  await button('Run audit').trigger('click')
  await flushMicrotasks(6)
  expect(actions).toEqual(['audit'])
})

it.each(['popover', 'custom'] as const)('tours a real %s toolbar contribution', async (toolbar) => {
  const { wrapper, deliver, button } = await setup({ anchors: ['toolbar'], toolbar })
  await deliver()
  expect(wrapper.get('[aria-label="Plugin added"]').text()).toContain('Audit tool added')
  await button('Got it').trigger('click')
  expect(wrapper.find('[aria-label="Plugin added"]').exists()).toBe(false)
})

it('retains selected destination when mounted wizard handles navigation first', async () => {
  const { wrapper, deliver, targets } = await setup({ openPane: 'Audit results', wizard: true })
  await deliver()
  expect(targets.pane).toHaveBeenCalledExactlyOnceWith('a11y:results')
  expect(wrapper.get('[aria-label="Plugin added"]').text()).toContain('Audit results pane added')
})

it('resolves anchors inside owning provider when two books register same contribution IDs', async () => {
  const first = await setup()
  const second = await setup()
  await second.deliver()
  expect(first.wrapper.get('[role="tab"]').attributes('aria-details')).toBeUndefined()
  expect(second.wrapper.get('[role="tab"]').attributes('aria-details')).toBe(second.wrapper.get('[aria-label="Plugin added"]').attributes('id'))
})

it('removes stale anchor relation when control disappears during tour', async () => {
  const { wrapper, deliver } = await setup()
  await deliver()
  const tab = wrapper.get('[role="tab"]')
  tab.element.setAttribute('hidden', '')
  await flushMicrotasks(32)
  expect(tab.attributes('aria-details')).toBeUndefined()
  expect(wrapper.get('[aria-label="Plugin added"]').text()).toContain('Audit results pane added')
})

it('late metadata cannot revive retired job or close newly opened marketplace', async () => {
  const { wrapper, channel, store } = await setup()
  channel.emit('histoire:ui:marketplace-job-state', { job: job({ status: 'succeeded', steps: [{ id: 'load', state: 'done' }] }) })
  await flushMicrotasks(32)
  const request = channel.sent.find(item => item.event === 'histoire:ui:marketplace-detail')!
  channel.emit('histoire:ui:marketplace-job-state', { job: job({ jobId: 'job-2' }) })
  store.openMarketplace()
  channel.emit('histoire:ui:marketplace-detail-result', { requestId: request.value.requestId, detail: structuredClone(accessibility) })
  await flushMicrotasks(32)
  expect(wrapper.find('[aria-label="Plugin added"]').exists()).toBe(false)
  expect(store.open.value).toBe(true)
})

it('catalog failure retains actual anchors without inventing descriptive copy', async () => {
  const { wrapper, channel } = await setup()
  channel.emit('histoire:ui:marketplace-job-state', { job: job({ status: 'succeeded', steps: [{ id: 'load', state: 'done' }] }) })
  await flushMicrotasks(32)
  const request = channel.sent.find(item => item.event === 'histoire:ui:marketplace-detail')!
  channel.emit('histoire:ui:marketplace-detail-result', { requestId: request.value.requestId, error: { code: 'failed', message: 'Offline' } })
  await flushMicrotasks(32)
  expect(wrapper.get('[aria-label="Plugin added"]').text()).toContain('A11y tab added')
  expect(wrapper.get('[aria-label="Plugin added"]').text()).not.toContain('Live accessibility audits')
})

it('unmount retires held reads and leaves server job uncancelled', async () => {
  const { channel } = await setup()
  channel.emit('histoire:ui:marketplace-job-state', { job: job({ status: 'succeeded', steps: [{ id: 'load', state: 'done' }] }) })
  await flushMicrotasks(32)
  const request = channel.sent.find(item => item.event === 'histoire:ui:marketplace-detail')!
  await cleanups.pop()!()
  channel.emit('histoire:ui:marketplace-detail-result', { requestId: request.value.requestId, detail: structuredClone(accessibility) })
  await flushMicrotasks(32)
  expect(channel.listenerCount()).toBe(0)
  expect(document.querySelector('[aria-label="Plugin added"]')).toBeNull()
  expect(channel.sent.some(item => item.event === 'histoire:ui:marketplace-job-cancel')).toBe(false)
})

// Two same-kind registrations reject first-of-kind guessing; exact local ids own copy.
it('matches each pane description by local id despite manifest order', async () => {
  const { wrapper, deliver, button } = await setup({ anchors: ['pane'], secondPane: true, adds: [
    { kind: 'rail-pane', contribution: 'history', text: 'Past audit runs' },
    { kind: 'rail-pane', contribution: 'results', text: 'Current audit findings' },
  ] })
  await deliver()
  expect(wrapper.get('[aria-label="Plugin added"]').text()).toContain('Current audit findings')
  expect(wrapper.get('[aria-label="Plugin added"]').text()).not.toContain('Past audit runs')
  await button('Next').trigger('click')
  expect(wrapper.get('[aria-label="Plugin added"]').text()).toContain('Past audit runs')
  expect(wrapper.get('[aria-label="Plugin added"]').text()).not.toContain('Current audit findings')
})

it.each([true, false])('omits ambiguous legacy descriptions with hidden extra pane (available: %s)', async (secondPaneAvailable) => {
  const { wrapper, deliver } = await setup({ anchors: ['pane'], secondPane: true, secondPaneAvailable, adds: [{ kind: 'rail-pane', text: 'Unmapped pane description' }] })
  wrapper.get('[data-shell-pane="a11y:history"]').element.setAttribute('hidden', '')
  await deliver()
  expect(wrapper.get('[aria-label="Plugin added"]').text()).not.toContain('Unmapped pane description')
})

it.each(['pane', 'tab'])('executes explicit %s primary command through host runner', async (anchor) => {
  const { deliver, button, actions } = await setup({ anchors: [anchor], primaryCommand: 'run' })
  await deliver()
  await button('Run audit').trigger('click')
  await flushMicrotasks(6)
  expect(actions).toEqual(['audit'])
})

it.each(['pane', 'tab'])('omits missing and unavailable %s primary actions', async (anchor) => {
  for (const options of [{ primaryCommand: 'missing' }, { primaryCommand: 'run', commandUnavailable: true }]) {
    const { wrapper, deliver, actions } = await setup({ anchors: [anchor], ...options })
    await deliver()
    expect(wrapper.get('[aria-label="Plugin added"]').text()).not.toContain('Run audit')
    expect(actions).toEqual([])
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  }
})
