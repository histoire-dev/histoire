import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoirePreview, HistoireProvider, HistoireVariantGrid, useHistoireSession, useHistoireSnapshot } from '../index.js'
import { useHistoireContext } from '../provider/context.js'

/** Existing SDK fixture retains runtime ownership while Vue exercises its own lifecycle. */
async function sessionFixture() {
  const fixture = sourceFixture()
  const session = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, fixture.adapters)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  return { fixture, session }
}

const Probe = defineComponent({
  setup() {
    const session = useHistoireSession()
    const snapshot = useHistoireSnapshot()
    return () => h('button', { onClick: () => session.settings.update({ colorScheme: 'dark' }) }, snapshot.value.settings.colorScheme)
  },
})

describe('native provider ownership', () => {
  it('rejects missing provider explicitly', () => {
    expect(() => mount(Probe)).toThrow('HistoireProvider is required')
  })

  it('isolates subscriptions and settings across two providers and leaves caller sessions alive', async () => {
    const first = await sessionFixture()
    const second = await sessionFixture()
    const stops = [vi.spyOn(first.session, 'subscribe'), vi.spyOn(second.session, 'subscribe')]
    const disposals = [vi.spyOn(first.session, 'dispose'), vi.spyOn(second.session, 'dispose')]
    const wrapper = mount(defineComponent({ render: () => h('main', [
      h('a', { href: '/host-route' }, 'Host route'),
      h(HistoireProvider, { session: first.session }, { default: () => h(Probe) }),
      h(HistoireProvider, { session: second.session }, { default: () => h(Probe) }),
    ]) }))
    await wrapper.findAll('button')[0].trigger('click')
    await nextTick()
    expect(wrapper.findAll('button').map(button => button.text())).toEqual(['dark', 'auto'])
    expect(wrapper.find('a').attributes('href')).toBe('/host-route')
    expect(stops.every(stop => stop.mock.calls.length === 2)).toBe(true)
    wrapper.unmount()
    expect(disposals.every(dispose => dispose.mock.calls.length === 0)).toBe(true)
    await first.session.settings.update({ colorScheme: 'light' })
    await Promise.all([first.session.dispose(), second.session.dispose()])
  })

  it('waits for actual primary readiness and cleans exactly one mount on child/provider removal', async () => {
    const { fixture, session } = await sessionFixture()
    const ready = deferred<any>()
    const original = fixture.adapters.mount!
    fixture.adapters.mount = vi.fn(context => ({ ...original(context), ready: ready.promise }))
    const onReady = vi.fn()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoirePreview, { onReady }) } })
    await nextTick()
    expect(onReady).not.toHaveBeenCalled()
    expect(wrapper.find('[aria-busy]').attributes('inert')).toBeDefined()
    ready.resolve(fixture.runtime())
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledOnce())
    expect(wrapper.find('[aria-busy]').attributes('inert')).toBeUndefined()
    wrapper.unmount()
    await vi.waitFor(() => expect(fixture.surfaceClose).toHaveBeenCalledOnce())
    expect(session.getSnapshot().status).toBe('ready')
    await session.dispose()
    expect(fixture.surfaceClose).toHaveBeenCalledOnce()
  })

  it('never starts a primary cancelled through callback ref before client mount', async () => {
    const { fixture, session } = await sessionFixture()
    const wrapper = mount(HistoireProvider, {
      props: { session },
      slots: { default: () => h(HistoirePreview, { ref: (value: unknown) => {
        const preview = value as { unmount: () => Promise<void> } | null
        if (preview) void preview.unmount()
      } }) },
    })
    await nextTick()
    expect(fixture.adapters.mount).not.toHaveBeenCalled()
    expect(session.getSnapshot().runtime.status).toBe('absent')
    wrapper.unmount()
    await session.dispose()
  })

  it('keeps a removed primary inert when retired readiness completes later', async () => {
    const { fixture, session } = await sessionFixture()
    const ready = deferred<any>()
    const original = fixture.adapters.mount!
    fixture.adapters.mount = vi.fn(context => ({ ...original(context), ready: ready.promise }))
    const onReady = vi.fn()
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoirePreview, { onReady }) } })
    await nextTick()
    const frame = wrapper.find('[aria-busy]').element
    wrapper.unmount()
    ready.resolve(fixture.runtime())
    await vi.waitFor(() => expect(fixture.surfaceClose).toHaveBeenCalledOnce())
    await nextTick()
    expect(frame.hasAttribute('inert')).toBe(true)
    expect(onReady).not.toHaveBeenCalled()
    expect(session.getSnapshot().runtime.status).toBe('absent')
    await session.dispose()
  })

  it('exposes an awaitable unmount that finishes primary ownership before replacement', async () => {
    const { fixture, session } = await sessionFixture()
    const closed = deferred<void>()
    const preview = shallowRef<{ unmount: () => Promise<void> } | null>(null)
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(HistoirePreview, { ref: preview }) } })
    await vi.waitFor(() => expect(session.getSnapshot().runtime.status).toBe('ready'))
    fixture.surfaceClose.mockImplementationOnce(() => closed.promise)
    const closing = preview.value!.unmount()
    expect(closing).toBeInstanceOf(Promise)
    expect(() => session.mount(document.createElement('div'), { surface: 'grid' })).toThrow('Session already owns a primary runtime.')
    closed.resolve()
    await closing
    wrapper.unmount()
    const replacement = session.mount(document.createElement('div'), { surface: 'grid' })
    await replacement.ready
    await replacement.unmount()
    await session.dispose()
    expect(fixture.surfaceClose).toHaveBeenCalledTimes(2)
  })

  it('surfaces competing preview/grid error and observes teardown rejection', async () => {
    const { fixture, session } = await sessionFixture()
    const errors: unknown[] = []
    const shown = ref(true)
    const wrapper = mount(HistoireProvider, { props: { session, onError: (error: unknown) => errors.push(error) }, slots: { default: () => shown.value ? [h(HistoirePreview), h(HistoireVariantGrid)] : [] } })
    await vi.waitFor(() => expect(errors.some((error: any) => error.code === 'RUNTIME_IN_USE')).toBe(true))
    expect(fixture.adapters.mount).toHaveBeenCalledOnce()
    fixture.surfaceClose.mockRejectedValueOnce(new Error('close failed'))
    shown.value = false
    await nextTick()
    await vi.waitFor(() => expect(errors.some((error: any) => error.message === 'close failed')).toBe(true))
    wrapper.unmount()
    await expect(session.dispose()).rejects.toThrow()
  })

  it('measures provider container, disconnects observer, and owns local overlay target', async () => {
    const { session } = await sessionFixture()
    let context: ReturnType<typeof useHistoireContext> | undefined
    let callback: ResizeObserverCallback | undefined
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(listener: ResizeObserverCallback) { callback = listener }
      observe() {}
      disconnect = disconnect
    })
    const Child = defineComponent({ setup() {
      context = useHistoireContext()
      return () => h('span', 'child')
    } })
    const wrapper = mount(HistoireProvider, { props: { session }, slots: { default: () => h(Child) } })
    await nextTick()
    expect(context!.overlay.value?.parentElement).toBe(context!.root.value)
    callback!([{ contentRect: { width: 420, height: 240 } }] as ResizeObserverEntry[], {} as ResizeObserver)
    expect(context!.size.value).toEqual({ width: 420, height: 240 })
    wrapper.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
    await session.dispose()
  })
})
