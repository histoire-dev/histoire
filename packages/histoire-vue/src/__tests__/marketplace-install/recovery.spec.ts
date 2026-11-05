import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { stubMarketplaceSession } from '../utils/marketplace-transport.js'
import { job, plugin, setup } from './fixtures.js'

vi.mock('virtual:$histoire-config', () => ({ installedPlugins: [{ packageName: '@histoire/plugin-a11y', id: 'a11y' }] }))
beforeEach(stubMarketplaceSession)

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

it('does not mistake older successful version for current install intent', async () => {
  const { ready, channel, wrapper } = setup(cleanups)
  await ready()
  channel.emit('histoire:ui:marketplace-job-state', { job: job({ version: '0.9.0', status: 'succeeded', steps: [{ id: 'load', state: 'done' }] }) })
  await flushMicrotasks(6)
  expect(wrapper.find('input[role="switch"]').exists()).toBe(true)
  expect(wrapper.find('[aria-live="polite"]').exists()).toBe(false)
})

it('opens registered pane automatically only when user selected post-install navigation', async () => {
  const { ready, button, wrapper, channel, request, targets, store } = setup(cleanups, false, true)
  await ready()
  await button('Continue').trigger('click')
  await wrapper.get('[role="checkbox"][aria-label^="Open "]').trigger('click')
  await button('Install').trigger('click')
  channel.emit('histoire:ui:marketplace-job-state', { requestId: request('job-start').requestId, job: job() })
  await flushMicrotasks(6)
  expect(targets.pane).not.toHaveBeenCalled()
  channel.emit('histoire:ui:marketplace-job-state', { job: job({ status: 'succeeded', steps: [{ id: 'load', state: 'done' }] }) })
  await vi.waitFor(() => expect(targets.pane).toHaveBeenCalledExactlyOnceWith('a11y:issues'))
  expect(store.open.value).toBe(false)
  expect(store.postInstall.value).toBeUndefined()
})

it('closing wizard retires held detail response before Vue unmount', async () => {
  const { store, channel, request } = setup(cleanups)
  const detailRequest = request('detail')
  store.close()
  channel.emit('histoire:ui:marketplace-detail-result', { requestId: detailRequest.requestId, detail: plugin() })
  await flushMicrotasks(6)
  expect(channel.sent.some(item => item.event.endsWith('-plan'))).toBe(false)
})
