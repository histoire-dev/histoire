import type { UiVisualReply, UiVisualRequest, UiVisualResult, UiVisualRun } from '@histoire/shared'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { HistoireProvider } from '@histoire/vue'
import { flushPromises, mount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import MenuItem from '../../../histoire-app/src/app/components/menu/MenuItem.vue'
import VisualTestsPanel from '../../../histoire-app/src/app/components/panes/visual/VisualTestsPanel.vue'
import { createWorkbenchVisual, provideWorkbenchVisual } from '../../../histoire-app/src/app/stores/visual.js'
import { sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { resizeObserverFixture } from './fixtures/resize-observer.js'

const channel = vi.hoisted(() => ({
  listeners: new Set<(reply: UiVisualReply) => void>(),
  send: (_event: string, _request: UiVisualRequest) => false,
}))

// Hold only external visual-service replies; panel, store, and transport stay real.
vi.mock('../../../histoire-app/src/app/util/ui-channel.js', () => ({
  sendUiEvent: (event: string, request: UiVisualRequest) => channel.send(event, request),
  onUiEvent: (_event: string, listener: (reply: UiVisualReply) => void) => {
    channel.listeners.add(listener)
    return () => channel.listeners.delete(listener)
  },
  onUiDisconnect: () => () => {},
  onUiReconnect: () => () => {},
}))

/** Two distinct reviewable captures let partial approval leave useful retry controls. */
function results(): UiVisualResult[] {
  return ['one', 'two'].map(id => ({
    id,
    case: { id, schemaVersion: 1, kind: 'canonical', storyId: 'a:b', variantId: 'c', label: id },
    spec: { id: 'desktop-light' },
    status: 'missing',
    currentHash: `hash-${id}`,
    reviewHandle: `handle-${id}`,
    images: {},
  }))
}

/** Deliver correlated external response without replacing request matching. */
function reply(value: UiVisualReply): void {
  for (const listener of channel.listeners) listener(value)
}

it.each([false, true])('replaces approval controls while pending and restores remaining selections (failure: %s)', async (failed) => {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  const captures = results()
  let pending: Extract<UiVisualRequest, { action: 'approve-review' }> | undefined
  channel.send = (_event, request) => {
    if (request.action === 'approve-review') {
      pending = request
    }
    else {
      const value: UiVisualReply = request.action === 'inventory'
        ? { requestId: request.requestId, inventory: { cases: captures.map(result => result.case), total: 2, profiles: [{ id: 'desktop-light' }], baselineRef: 'main' } }
        : { requestId: request.requestId, recovered: { results: captures, total: 2, issues: [] } }
      queueMicrotask(() => reply(value))
    }
    return true
  }
  let model: ReturnType<typeof createWorkbenchVisual> | undefined
  const host = defineComponent({
    setup() {
      model = createWorkbenchVisual(session)
      provideWorkbenchVisual(model)
      return () => h(VisualTestsPanel)
    },
  })
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(host) } })
  try {
    await flushPromises()
    await wrapper.get('footer input[type="checkbox"]').setValue(true)
    await wrapper.get('footer button').trigger('click')
    expect(pending?.selections).toEqual([{ handle: 'handle-one', resultId: 'one' }, { handle: 'handle-two', resultId: 'two' }])
    expect(wrapper.find('footer').exists()).toBe(false)
    expect(wrapper.get('[role="status"][aria-atomic="true"]').text()).toBe('Approving screenshots…')

    if (!failed) {
      reply({ requestId: pending!.requestId, receipts: [{ resultId: 'one', status: 'approved' }], done: false })
      await flushPromises()
      expect(model!.results.value.find(result => result.id === 'one')?.approved).toBe(true)
      expect(model!.selectedIds.value).toEqual(['two'])
      expect(model!.approving.value).toBe(true)
      expect(model!.approvalPending(model!.results.value.find(result => result.id === 'two')!)).toBe(true)
      expect(model!.approvalPending(model!.results.value.find(result => result.id === 'one')!)).toBe(false)
      // Another request cannot settle still-running approval.
      reply({ requestId: 'foreign-request', done: true })
      expect(model!.approving.value).toBe(true)
    }
    reply(failed
      ? { requestId: pending!.requestId, error: 'Baseline write failed' }
      : { requestId: pending!.requestId, receipts: [{ resultId: 'two', status: 'conflict', error: 'Baseline changed' }], done: true })
    await flushPromises()
    expect(wrapper.find('[role="status"][aria-atomic="true"]').exists()).toBe(false)
    expect(wrapper.get('footer button').text()).toBe(`Approve ${failed ? 2 : 1} selected`)
    expect(wrapper.get('footer button').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[role="alert"]').text()).toBe(failed ? 'Baseline write failed' : 'Baseline changed')
    expect(model!.selectedIds.value).toEqual(failed ? ['one', 'two'] : ['two'])
  }
  finally {
    wrapper.unmount()
    model?.close()
    await session.dispose()
    channel.listeners.clear()
  }
})

it('applies late receipt to original comparison while preserving another source selection', async () => {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  const working = { ...results()[0], baselineSource: 'Working tree', comparisonKey: 'working' }
  const main = { ...working, baselineSource: 'main', comparisonKey: 'main', reviewHandle: 'main-handle' }
  let pending: Extract<UiVisualRequest, { action: 'approve-review' }> | undefined
  channel.send = (_event, request) => {
    if (request.action === 'approve-review') {
      pending = request
    }
    else {
      queueMicrotask(() => reply(request.action === 'inventory'
        ? { requestId: request.requestId, inventory: { cases: [working.case], total: 1, profiles: [{ id: 'desktop-light' }], baselineRef: 'main' } }
        : { requestId: request.requestId, recovered: { results: [working, main], total: 2, issues: [] } }))
    }
    return true
  }
  let model!: ReturnType<typeof createWorkbenchVisual>
  const host = defineComponent({
    setup() {
      model = createWorkbenchVisual(session)
      return () => null
    },
  })
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(host) } })
  try {
    await flushPromises()
    model.selectedIds.value = ['one']
    const operation = model.approve(['one'])
    expect(model.approvalPending(working)).toBe(true)
    model.baselineSource.value = 'main'
    await flushPromises()
    model.selectedIds.value = ['one']
    reply({ requestId: pending!.requestId, receipts: [{ resultId: 'one', status: 'approved' }], done: false })
    await flushPromises()
    expect(model.results.value[0].approved).toBeUndefined()
    expect(model.selectedIds.value).toEqual(['one'])
    reply({ requestId: pending!.requestId, done: true })
    await operation
    model.baselineSource.value = 'working'
    expect(model.results.value[0].approved).toBe(true)
  }
  finally {
    wrapper.unmount()
    model.close()
    await session.dispose()
    channel.listeners.clear()
  }
})

it('runs incrementally from Run, busies only planned rows, and revalidates rows skipped after failed recovery', async () => {
  resizeObserverFixture()
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  const captures = results()
  const runs: Extract<UiVisualRequest, { action: 'run' }>[] = []
  let recoveries = 0
  /** Run summary without result rows; empty completed results keep cached rows untouched. */
  const summary = (id: string, state: UiVisualRun['state'] = 'completed'): UiVisualRun => ({ id, platform: 'linux-x64', baselineSource: 'Working tree', state, results: [], total: 0, reportPath: '', htmlPath: '', ok: true })
  channel.send = (_event, request) => {
    queueMicrotask(() => {
      if (request.action === 'inventory') {
        reply({ requestId: request.requestId, inventory: { cases: captures.map(result => result.case), total: 2, profiles: [{ id: 'desktop-light' }], baselineRef: 'main' } })
      }
      // Recovery after source change fails, leaving rows marked stale client-side.
      else if (request.action === 'recover') {
        reply(++recoveries === 2 ? { requestId: request.requestId, error: 'Visual operation timed out' } : { requestId: request.requestId, recovered: { results: captures, total: 2, issues: [] } })
      }
      // Runs stay held so test can observe busy rows before completion.
      else if (request.action === 'run') {
        runs.push(request)
      }
      else if (request.action === 'results') {
        reply({ requestId: request.requestId, run: summary(request.runId) })
      }
    })
    return true
  }
  let model!: ReturnType<typeof createWorkbenchVisual>
  const host = defineComponent({
    setup() {
      model = createWorkbenchVisual(session)
      provideWorkbenchVisual(model)
      return () => h(VisualTestsPanel)
    },
  })
  const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(host) } })
  try {
    await flushPromises()
    fixture.descriptor.revision = 'revision-2'
    fixture.emitCatalog()
    await flushPromises()
    expect(model.results.value.every(result => result.staleReason)).toBe(true)
    await wrapper.findAll('button').find(button => button.text() === 'Run')!.trigger('click')
    await flushPromises()
    expect(runs[0].options?.incremental).toBe(true)
    const busy = () => model.results.value.filter(result => model.busy(result)).map(result => result.id)
    // Nothing is busy until server announces which comparisons need capturing.
    expect(busy()).toEqual([])
    reply({ requestId: runs[0].requestId, planned: ['one'] })
    reply({ requestId: runs[0].requestId, run: summary('run-1', 'running') })
    expect(busy()).toEqual(['one'])
    reply({ requestId: runs[0].requestId, run: summary('run-1') })
    await flushPromises()
    expect(busy()).toEqual([])
    expect(recoveries).toBe(3)
    expect(model.results.value.some(result => result.staleReason)).toBe(false)
    await wrapper.get('button[aria-label="Run options"]').trigger('click')
    await wrapper.findComponent(MenuItem).trigger('click')
    await flushPromises()
    expect(runs[1].options?.incremental).toBeUndefined()
    expect(busy()).toEqual(['one', 'two'])
    reply({ requestId: runs[1].requestId, run: summary('run-2') })
    await flushPromises()
    expect(recoveries).toBe(3)
  }
  finally {
    wrapper.unmount()
    model.close()
    await session.dispose()
    channel.listeners.clear()
  }
})
