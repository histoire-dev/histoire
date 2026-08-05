import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EVENT_SEND,
  PREVIEW_SETTINGS_SYNC,
  PREVIEW_SYNC,
  SANDBOX_READY,
  SELECT_VARIANT,
  STATE_SYNC,
  VARIANT_READY,
} from '../../../../histoire-app/src/app/util/const.js'
import { FAKE_ORIGIN, installFakeWindow } from './utils/fake-window.js'

/**
 * Behavioral tests for `usePreviewIframeHost`, the composable both story views
 * (grid and single variant) use to host their preview iframe.
 *
 * The composable registers lifecycle hooks, so it is mounted in a throwaway
 * component driven by a no-op renderer — the package runs in the `node` test
 * environment (a DOM environment makes the app-side dependency mocks below
 * ineffective). `pinia`, `vue-router` and the app router have no runtime build
 * resolvable from here, so the stores and the sandbox URL builder are mocked.
 * The iframe is a plain object: only its `contentWindow` matters.
 */

const ORIGIN = FAKE_ORIGIN

/** Stand-in for the preview `HTMLIFrameElement`. */
interface FakeFrame {
  contentWindow: { postMessage: ReturnType<typeof vi.fn> }
}

/** Story fixture shape, mirroring what the story store hands to the views. */
interface TestStory {
  id: string
  variants: { id: string, state: Record<string, any>, previewReady: boolean }[]
}

/** The fake document the composable runs against, installed per test. */
let fakeWindow: ReturnType<typeof installFakeWindow>
const previewRuntimeStore = {
  setFrame: vi.fn(),
  notifyFrameNavigating: vi.fn(),
}
const addEvent = vi.fn()

/**
 * Builds a story whose variants all start `previewReady: true`, reproducing the
 * stale readiness a host inherits when variant objects survive a navigation.
 */
function createStory(id: string, variantIds: string[]): TestStory {
  return {
    id,
    variants: variantIds.map(variantId => ({ id: variantId, state: {}, previewReady: true })),
  }
}

/**
 * Mounts the composable inside a real component and returns everything a test
 * needs to drive it.
 *
 * @param options How the host is wired.
 * @param options.mode Preview slot to host.
 * @param options.story Mutable holder of the current story.
 * @param options.story.value The story itself, nullable like the store's.
 * @param options.currentVariantId Mutable holder of the selected variant id.
 * @param options.currentVariantId.value The selected variant id.
 * @param options.onSelectVariant Grid-only selection callback.
 */
async function mountHost(options: {
  mode: 'single' | 'grid'
  story: { value: TestStory | null }
  currentVariantId: { value: string | null }
  onSelectVariant?: (variantId: string) => void
}) {
  vi.resetModules()
  vi.doMock('../../../../histoire-app/src/app/stores/preview-runtime', () => ({
    usePreviewRuntimeStore: () => previewRuntimeStore,
  }))
  vi.doMock('../../../../histoire-app/src/app/stores/preview-settings', () => ({
    usePreviewSettingsStore: () => ({ currentSettings: { backgroundColor: 'transparent' } }),
  }))
  vi.doMock('../../../../histoire-app/src/app/stores/events', () => ({
    useEventsStore: () => ({ addEvent }),
  }))
  // The real one imports the app router, which pulls in `vue-router`.
  vi.doMock('../../../../histoire-app/src/app/util/sandbox', () => ({
    getSandboxUrl: (story: TestStory, variant?: { id: string }) => `sandbox?story=${story.id}&variant=${variant?.id ?? 'grid'}`,
  }))

  const { createRenderer, h, markRaw, nextTick, reactive } = await import('vue')
  const { usePreviewIframeHost } = await import('../../../../histoire-app/src/app/util/preview-iframe-host.js')

  const state = reactive(options)
  const getStory = () => state.story.value
  const getCurrentVariant = () => state.story.value?.variants.find(variant => variant.id === state.currentVariantId.value) ?? null

  let host: ReturnType<typeof usePreviewIframeHost>
  // Nothing is rendered: the component only exists so the composable's
  // `onMounted`/`onBeforeUnmount` hooks run for real.
  const { createApp } = createRenderer<any, any>({
    createElement: type => ({ type }),
    createText: text => ({ text }),
    createComment: text => ({ text }),
    setText: () => {},
    setElementText: () => {},
    insert: () => {},
    remove: () => {},
    patchProp: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  const app = createApp({
    setup() {
      host = usePreviewIframeHost({
        mode: options.mode,
        getStory,
        getCurrentVariant,
        getVariantById: variantId => state.story.value?.variants.find(variant => variant.id === variantId) ?? null,
        markPreviewPending: () => {
          // Single mode owns the variant it shows, grid mode owns them all.
          const owned = options.mode === 'grid'
            ? state.story.value?.variants ?? []
            : [getCurrentVariant()].filter(Boolean)
          for (const variant of owned) {
            variant!.previewReady = false
          }
        },
        onSelectVariant: options.onSelectVariant,
        resetOnMount: options.mode === 'grid',
      })
      return () => h('div')
    },
  })
  app.mount({ type: 'root' })

  const frame: FakeFrame = { contentWindow: { postMessage: vi.fn() } }
  // Vue would wrap a plain object in a reactive proxy, breaking the identity
  // check against the message `source`.
  host!.iframe.value = markRaw(frame) as any

  return {
    ...host!,
    app,
    frame,
    state,
    /** Delivers a trusted message from the preview frame. */
    deliver(data: Record<string, any>) {
      fakeWindow.dispatchMessage({ source: frame.contentWindow, origin: ORIGIN, data: { __histoire: true, ...data } })
    },
    /** Payloads posted into the frame, optionally filtered by message type. */
    sent(type?: string) {
      const payloads = frame.contentWindow.postMessage.mock.calls.map(call => call[0])
      return type ? payloads.filter(payload => payload.type === type) : payloads
    },
    nextTick,
  }
}

describe('preview iframe host', () => {
  beforeEach(() => {
    fakeWindow = installFakeWindow()
    previewRuntimeStore.setFrame.mockClear()
    previewRuntimeStore.notifyFrameNavigating.mockClear()
    addEvent.mockClear()
  })

  afterEach(() => {
    fakeWindow.uninstall()
  })

  it('drops the readiness inherited from a previous mount', async () => {
    const gridStory = createStory('story-a', ['variant-a', 'variant-b'])
    await mountHost({ mode: 'grid', story: { value: gridStory }, currentVariantId: { value: 'variant-a' } })
    // The grid hosts every variant in one document, so all of them are pending.
    expect(gridStory.variants.map(variant => variant.previewReady)).toEqual([false, false])

    const singleStory = createStory('story-a', ['variant-a', 'variant-b'])
    await mountHost({ mode: 'single', story: { value: singleStory }, currentVariantId: { value: 'variant-a' } })
    // The single view only owns the variant it shows.
    expect(singleStory.variants.map(variant => variant.previewReady)).toEqual([false, true])
  })

  it('marks the variant the sandbox reports, not the selected one', async () => {
    const story = createStory('story-a', ['variant-a', 'variant-b'])
    const host = await mountHost({ mode: 'grid', story: { value: story }, currentVariantId: { value: 'variant-a' } })

    // A readiness event without a variant id, or about an unknown variant,
    // must not flip the selected one.
    host.deliver({ type: SANDBOX_READY })
    host.deliver({ type: VARIANT_READY, variantId: 'gone' })
    expect(story.variants.map(variant => variant.previewReady)).toEqual([false, false])

    host.deliver({ type: SANDBOX_READY, variantId: 'variant-b' })
    expect(story.variants[1].previewReady).toBe(true)
    // Not the selected variant: nothing is pushed into the frame for it.
    expect(host.sent(STATE_SYNC)).toHaveLength(0)

    host.deliver({ type: VARIANT_READY, variantId: 'variant-a' })
    expect(story.variants[0].previewReady).toBe(true)
    expect(host.sent(STATE_SYNC)).toHaveLength(1)
    expect(host.sent(PREVIEW_SETTINGS_SYNC)).toHaveLength(1)
  })

  it('routes incoming state updates to the exact variant id', async () => {
    const story = createStory('story-a', ['variant-a', 'variant-b'])
    const host = await mountHost({ mode: 'grid', story: { value: story }, currentVariantId: { value: 'variant-a' } })

    host.deliver({ type: STATE_SYNC, variantId: 'variant-b', state: { count: 3 } })

    expect(story.variants[1].state).toMatchObject({ count: 3 })
    expect(story.variants[0].state).toEqual({})
  })

  it('forwards story events to the events store', async () => {
    const story = createStory('story-a', ['variant-a'])
    const host = await mountHost({ mode: 'single', story: { value: story }, currentVariantId: { value: 'variant-a' } })

    host.deliver({ type: EVENT_SEND, event: { name: 'click', argument: 1 } })

    expect(addEvent).toHaveBeenCalledWith({ name: 'click', argument: 1 })
  })

  it('builds a whole-story sandbox url for the grid and a variant-pinned one for the single view', async () => {
    const story = createStory('story-a', ['variant-a', 'variant-b'])

    const grid = await mountHost({ mode: 'grid', story: { value: story }, currentVariantId: { value: 'variant-b' } })
    expect(grid.sandboxUrl.value).toBe('sandbox?story=story-a&variant=grid')

    const single = await mountHost({ mode: 'single', story: { value: story }, currentVariantId: { value: 'variant-b' } })
    expect(single.sandboxUrl.value).toBe('sandbox?story=story-a&variant=variant-b')

    // Navigating away clears the story before the host unmounts, and the eager
    // watcher re-evaluates the computed: it must not dereference nothing.
    grid.state.story.value = null
    await grid.nextTick()
    expect(grid.sandboxUrl.value).toBeNull()
  })

  it('re-arms readiness and warns the runtime store when the sandbox url changes', async () => {
    const story = createStory('story-a', ['variant-a'])
    const host = await mountHost({ mode: 'single', story: { value: story }, currentVariantId: { value: 'variant-a' } })

    host.onIframeLoad()
    host.deliver({ type: SANDBOX_READY, variantId: 'variant-a' })
    expect(host.isIframeLoaded.value).toBe(true)
    expect(story.variants[0].previewReady).toBe(true)
    previewRuntimeStore.notifyFrameNavigating.mockClear()
    const syncsBefore = host.sent(PREVIEW_SYNC).length

    host.state.story.value = createStory('story-b', ['variant-a'])
    await host.nextTick()

    expect(host.isIframeLoaded.value).toBe(false)
    expect(host.state.story.value!.variants[0].previewReady).toBe(false)
    // Navigation reuses the iframe element (only `src` changes), so the store
    // only learns about it through this notice.
    expect(previewRuntimeStore.notifyFrameNavigating).toHaveBeenCalledTimes(1)
    // Nothing is posted into the outgoing document: its dying runtime would
    // answer SANDBOX_READY and prematurely flip readiness back on.
    expect(host.sent(PREVIEW_SYNC)).toHaveLength(syncsBefore)
  })

  it('announces the navigation at setup for the grid only', async () => {
    const story = createStory('story-a', ['variant-a'])

    await mountHost({ mode: 'single', story: { value: story }, currentVariantId: { value: 'variant-a' } })
    expect(previewRuntimeStore.notifyFrameNavigating).not.toHaveBeenCalled()

    await mountHost({ mode: 'grid', story: { value: story }, currentVariantId: { value: 'variant-a' } })
    expect(previewRuntimeStore.notifyFrameNavigating).toHaveBeenCalledTimes(1)
  })

  it('flags grid mode in the selection it pushes to the preview', async () => {
    const story = createStory('story-a', ['variant-a', 'variant-b'])

    const grid = await mountHost({ mode: 'grid', story: { value: story }, currentVariantId: { value: 'variant-b' } })
    grid.onIframeLoad()
    expect(grid.sent(PREVIEW_SYNC)[0]).toMatchObject({ storyId: 'story-a', variantId: 'variant-b', grid: true })
    // The preview runtime drops inbound messages without the marker.
    expect(grid.sent().every(payload => payload.__histoire === true)).toBe(true)

    const single = await mountHost({ mode: 'single', story: { value: story }, currentVariantId: { value: 'variant-b' } })
    single.onIframeLoad()
    expect(single.sent(PREVIEW_SYNC)[0]).toMatchObject({ storyId: 'story-a', variantId: 'variant-b', grid: false })
  })

  it('negotiates variant selection with the grid document, both ways', async () => {
    const story = createStory('story-a', ['variant-a', 'variant-b'])
    const onSelectVariant = vi.fn()
    const host = await mountHost({
      mode: 'grid',
      story: { value: story },
      currentVariantId: { value: 'variant-a' },
      onSelectVariant,
    })

    host.deliver({ type: SELECT_VARIANT, variantId: 'variant-b' })
    expect(onSelectVariant).toHaveBeenCalledWith('variant-b')

    host.state.currentVariantId.value = 'variant-b'
    await host.nextTick()
    // Pushed into the running document rather than remounting it, so the other
    // variants keep their live state.
    expect(host.sent(SELECT_VARIANT)).toEqual([{ __histoire: true, type: SELECT_VARIANT, variantId: 'variant-b' }])
  })

  it('ignores selection messages in single mode, which remounts instead', async () => {
    const story = createStory('story-a', ['variant-a', 'variant-b'])
    const host = await mountHost({ mode: 'single', story: { value: story }, currentVariantId: { value: 'variant-a' } })

    host.deliver({ type: SELECT_VARIANT, variantId: 'variant-b' })
    host.state.currentVariantId.value = 'variant-b'
    await host.nextTick()

    expect(host.sent(SELECT_VARIANT)).toHaveLength(0)
    // The sandbox url is what changes instead, loading a fresh document.
    expect(host.sandboxUrl.value).toBe('sandbox?story=story-a&variant=variant-b')
  })

  it('publishes and retracts its frame in the runtime store slot it owns', async () => {
    const story = createStory('story-a', ['variant-a'])
    const host = await mountHost({ mode: 'grid', story: { value: story }, currentVariantId: { value: 'variant-a' } })

    // Mounted before the ref was assigned, so the frame lands on load.
    expect(previewRuntimeStore.setFrame).toHaveBeenNthCalledWith(1, 'grid', null)
    host.onIframeLoad()
    expect(previewRuntimeStore.setFrame).toHaveBeenLastCalledWith('grid', host.frame)

    host.app.unmount()
    expect(previewRuntimeStore.setFrame).toHaveBeenLastCalledWith('grid', null)
  })

  it('remounts the iframe element when asked to reload', async () => {
    const story = createStory('story-a', ['variant-a'])
    const host = await mountHost({ mode: 'grid', story: { value: story }, currentVariantId: { value: 'variant-a' } })

    host.onIframeLoad()
    expect(host.isIframeLoaded.value).toBe(true)

    const key = host.iframeReloadKey.value
    host.reloadPreviewFrame()

    // The key re-keys the `<iframe>`, so Vue mounts a brand new element.
    expect(host.iframeReloadKey.value).toBe(key + 1)
    expect(host.isIframeLoaded.value).toBe(false)
  })

  it('ignores messages that are not from its own frame', async () => {
    const story = createStory('story-a', ['variant-a'])
    const host = await mountHost({ mode: 'single', story: { value: story }, currentVariantId: { value: 'variant-a' } })

    // Foreign window, then our own frame but without the histoire marker.
    fakeWindow.dispatchMessage({ source: { postMessage: vi.fn() }, origin: ORIGIN, data: { __histoire: true, type: SANDBOX_READY, variantId: 'variant-a' } })
    fakeWindow.dispatchMessage({ source: host.frame.contentWindow, origin: ORIGIN, data: { type: SANDBOX_READY, variantId: 'variant-a' } })

    expect(story.variants[0].previewReady).toBe(false)
  })
})
