import type { HistoireMount, HistoireSelectionInput } from '@histoire/sdk'
import { MessageChannel } from 'node:worker_threads'
import { createHistoireSessionWithAdapters } from '@histoire/sdk/internal'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { h, nextTick, shallowRef } from 'vue'
import { createStandaloneSelection } from '../../../histoire-app/src/app/standalone/selection.js'
import { mountLocalHistoireSurface } from '../../../histoire-app/src/embed/adapters/local-mount.js'
import { createEmbedRuntimeFrame } from '../../../histoire-app/src/embed/adapters/runtime-frame.js'
import { registerEmbedSurface } from '../../../histoire-app/src/embed/surfaces.js'
import { deferred, sourceFixture } from '../../../histoire-sdk/src/__tests__/fixtures/session.js'
import { HistoirePreview } from '../components/preview/HistoirePreview.js'
import { HistoireProvider } from '../provider/HistoireProvider.js'

beforeEach(() => {
  vi.stubGlobal('MessageChannel', MessageChannel)
  vi.stubGlobal('ResizeObserver', class {
    /** No layout observers are needed to prove document readiness ownership. */
    observe() {}
    /** Release the inert test observer. */
    disconnect() {}
  })
})
afterEach(() => vi.unstubAllGlobals())

/** Real local transport and runtime frame retain one native primary across selections. */
async function createPrimary(closing?: Promise<void>, standalone = false) {
  const fixture = sourceFixture()
  fixture.descriptor.config = { title: 'Book', autoApplyContrastColor: false, theme: { defaultColorScheme: 'light', darkClass: 'dark' }, responsivePresets: [], backgroundPresets: [], storyCollectTimeout: 1000 }
  const unregister = registerEmbedSurface('preview', context => createEmbedRuntimeFrame(context, 'single'))
  const adapters = { ...fixture.adapters, mount: vi.fn((context) => {
    const transport = mountLocalHistoireSurface(context, 'https://book.example/')
    if (!closing) return transport
    return { ...transport,
      /** Preserve primary reservation until asynchronous transport teardown completes. */
      async close() {
        await closing
        await transport.close()
      } }
  }) }
  const controller = createHistoireSessionWithAdapters({ url: 'https://book.example/' }, adapters)
  const selection = standalone ? createStandaloneSelection(controller) : undefined
  const session = selection?.session ?? controller
  const errors: unknown[] = []
  const onReady = vi.fn()
  const preview = shallowRef<{ mount: HistoireMount, unmount: () => Promise<void> } | null>(null)
  await session.connect()
  await session.selection.select({ storyId: 'a:b', variantId: 'c' })
  const wrapper = mount(HistoireProvider, { props: { session, onError: error => errors.push(error) }, slots: { default: () => h(HistoirePreview, { ref: preview, onReady }) }, attachTo: document.body })
  await vi.waitFor(() => expect(wrapper.find('iframe').exists()).toBe(true))
  /** Current frame messages carry exact document identity and selected target. */
  function publish(type = '__histoire:variant-ready', documentId?: string, error?: { message: string }) {
    const frame = wrapper.get('iframe').element as HTMLIFrameElement
    const target = session.getSnapshot().selection!
    window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: window.location.origin, data: { __histoire: true, type, documentId: documentId ?? new URL(frame.src).searchParams.get('documentId'), storyId: target.storyId, variantId: target.variantId, error } }))
  }
  /** Explicit native cleanup releases primary but leaves caller session connected. */
  async function close() {
    await preview.value!.unmount()
    expect(session.getSnapshot().runtime.mountId).toBeNull()
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(session.getSnapshot().status).toBe('ready')
    wrapper.unmount()
    selection?.close()
    await session.dispose()
    unregister()
  }
  return { session, wrapper, preview, errors, onReady, adapters, publish, close }
}

it.each<HistoireSelectionInput>([{ storyId: 'docs' }, { storyId: 'a:b', variantId: null }])('recovers retained primary when initial runtime retires for %j', async (target) => {
  const primary = await createPrimary()
  try {
    const initialMount = primary.preview.value!.mount
    await primary.session.selection.select(target)
    await expect(initialMount.ready).rejects.toMatchObject({ code: 'RUNTIME_CHANGED' })
    expect(primary.errors).toEqual([])
    const previousEvents = primary.onReady.mock.calls.length
    const selecting = primary.session.selection.select({ storyId: 'a:b', variantId: 'c' })
    primary.publish()
    await selecting
    await nextTick()
    expect(primary.session.getSnapshot().runtime.status).toBe('ready')
    expect(primary.wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(primary.wrapper.get('[aria-busy]').attributes('inert')).toBeUndefined()
    expect(primary.onReady).toHaveBeenCalledTimes(previousEvents + 1)
    expect(primary.preview.value!.mount).toBe(initialMount)
    expect(primary.adapters.mount).toHaveBeenCalledOnce()
  }
  finally { await primary.close() }
})

it('gates initial and replacement documents on actual current readiness', async () => {
  const primary = await createPrimary()
  try {
    expect(primary.wrapper.get('[aria-busy]').attributes('inert')).toBeDefined()
    expect(primary.onReady).not.toHaveBeenCalled()
    primary.publish()
    await primary.preview.value!.mount.ready
    await nextTick()
    expect(primary.onReady).toHaveBeenCalledOnce()
    const previousDocument = primary.session.getSnapshot().runtime.runtimeId!
    const selecting = primary.session.selection.select({ storyId: 'a:b', variantId: 'other' })
    await nextTick()
    expect(primary.wrapper.get('[aria-busy]').attributes('inert')).toBeDefined()
    primary.publish('__histoire:variant-ready', previousDocument)
    await nextTick()
    expect(primary.onReady).toHaveBeenCalledOnce()
    primary.publish()
    await selecting
    await nextTick()
    expect(primary.onReady).toHaveBeenCalledTimes(2)
    expect(primary.wrapper.get('[aria-busy]').attributes('inert')).toBeUndefined()
    expect(primary.errors).toEqual([])
    expect(primary.adapters.mount).toHaveBeenCalledOnce()
  }
  finally { await primary.close() }
})

it('reports actual initial runtime failure with original detail', async () => {
  const primary = await createPrimary()
  try {
    primary.publish('__histoire:runtime-failed', undefined, { message: 'Broken story' })
    await expect(primary.preview.value!.mount.ready).rejects.toMatchObject({ code: 'PREVIEW_NOT_READY', message: 'Broken story' })
    await nextTick()
    expect(primary.errors).toEqual([expect.objectContaining({ code: 'PREVIEW_NOT_READY', message: 'Broken story' })])
    expect(primary.wrapper.get('[role="alert"]').text()).toBe('Broken story')
    expect(primary.wrapper.get('[aria-busy]').attributes('inert')).toBeDefined()
  }
  finally { await primary.close() }
})

it('keeps a raw exposed mount inert after teardown starts during docs selection', async () => {
  const closing = deferred<void>()
  const primary = await createPrimary(closing.promise)
  let teardown: Promise<void> | undefined
  let stop = () => {}
  try {
    stop = primary.session.subscribe((snapshot) => {
      if (snapshot.selection?.storyId !== 'docs') return
      stop()
      teardown = primary.preview.value!.mount.unmount()
    })
    await primary.session.selection.select({ storyId: 'docs' })
    await nextTick()
    expect(primary.session.getSnapshot().runtime).toMatchObject({ status: 'absent', mountId: primary.preview.value!.mount.id })
    expect(primary.onReady).not.toHaveBeenCalled()
    expect(primary.wrapper.get('[aria-busy]').attributes('inert')).toBeDefined()
  }
  finally {
    stop()
    closing.resolve()
    await teardown
    await primary.close()
  }
})

it('retains live ownership through standalone selection facade', async () => {
  const primary = await createPrimary(undefined, true)
  try {
    await primary.session.selection.select({ storyId: 'docs' })
    const selecting = primary.session.selection.select({ storyId: 'a:b', variantId: 'c' })
    primary.publish()
    await selecting
    await nextTick()
    expect(primary.wrapper.get('[aria-busy]').attributes('inert')).toBeUndefined()
    expect(primary.errors).toEqual([])
  }
  finally { await primary.close() }
})
