import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushMicrotasks } from '../../../../histoire/src/node/__tests__/utils/flush.js'
import { stubMarketplaceSession } from '../utils/marketplace-transport.js'
import { plan, plugin, setup } from './fixtures.js'

vi.mock('virtual:$histoire-config', () => ({ installedPlugins: [] }))
beforeEach(stubMarketplaceSession)

const cleanups: (() => unknown)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.unstubAllGlobals()
})

// Real wizard/store/client with external transport only. Cancel must return to
// selected plugin without admitting a job or losing marketplace navigation.
it('cancels options to selected plugin details without starting install', async () => {
  const { ready, wrapper, button, store, channel } = setup(cleanups)
  await ready()
  expect(wrapper.get('h1').text()).toBe('Install Accessibility')
  await button('Cancel').trigger('click')
  expect(store.view.value).toBe('detail')
  expect(store.selectedId.value).toBe('@histoire/plugin-a11y')
  expect(channel.sent.some(item => item.event.endsWith('job-start'))).toBe(false)
  store.back()
  expect(store.view.value).toBe('all')
})

it('loads and reviews options from the selected exact release', async () => {
  const { channel, request, wrapper } = setup(cleanups)
  await nextTick()
  const detailRequest = request('detail')
  expect(detailRequest).toMatchObject({ id: '@histoire/plugin-a11y', version: '1.0.0' })
  const metadata = plugin()
  channel.emit('histoire:ui:marketplace-detail-result', {
    requestId: detailRequest.requestId,
    detail: { ...metadata, latest: '1.0.0', manifest: { ...metadata.manifest, config: {
      import: 'HstA11y',
      options: [{ key: 'legacyRule', label: 'Legacy rule', type: 'string', default: 'older' }],
    } } },
  })
  await vi.waitFor(() => expect(request().request).toMatchObject({ version: '1.0.0', options: { legacyRule: 'older' } }))
  expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('older')
})

// Returning through completed steps must retain edits and require same current
// plan on the next review. A reset-on-back defect loses entered report name.
it('returns through completed Options step with edited values and current plan intact', async () => {
  const { ready, wrapper, button, request, channel } = setup(cleanups)
  await ready()
  await wrapper.get('input[type="text"]').setValue('Audit report')
  await vi.waitFor(() => expect(request().request.options.name).toBe('Audit report'))
  channel.emit('histoire:ui:marketplace-plan-result', { requestId: request().requestId, plan: plan('2') })
  await flushMicrotasks(6)
  await button('Continue').trigger('click')
  expect(wrapper.get('h1').text()).toBe('Review project changes')
  expect(wrapper.get('[aria-current="step"]').text()).toContain('Review')
  await button('Options').trigger('click')
  expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('Audit report')
  expect(wrapper.get('[aria-current="step"]').text()).toContain('Options')
  await button('Continue').trigger('click')
  await button('Install').trigger('click')
  expect(request('job-start')).toMatchObject({ planId: 'plan-2', hash: 'hash-2' })
})

it('copies reviewed command verbatim without admitting install', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  const { ready, button, channel } = setup(cleanups)
  await ready()
  await button('Continue').trigger('click')
  await button('Copy command').trigger('click')
  expect(writeText).toHaveBeenCalledExactlyOnceWith('pnpm add -D @histoire/plugin-a11y@1.0.0')
  expect(channel.sent.some(item => item.event.endsWith('job-start'))).toBe(false)
})

it('opens config diff for inspection before admitting install', async () => {
  const { ready, button, wrapper, channel } = setup(cleanups)
  await ready()
  await button('Continue').trigger('click')
  const config = wrapper.get('details[aria-label="histoire.config.ts"]')
  expect((config.element as HTMLDetailsElement).open).toBe(false)
  ;(config.get('summary').element as HTMLElement).click()
  await flushMicrotasks(6)
  expect((config.element as HTMLDetailsElement).open).toBe(true)
  expect(config.text()).toContain('HstA11y({ test: false })')
  expect(channel.sent.some(item => item.event.endsWith('job-start'))).toBe(false)
})
