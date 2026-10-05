import * as protocol from '@histoire/protocol'
import { createVariantStateSyncGuards, getVariantStateKey } from '@histoire/shared'
import * as vue from 'vue'
import { previewApp } from '../../virtual/preview-runtime/app.js'
import { previewComponents } from '../../virtual/preview-runtime/components.js'
import { previewHostMessaging } from '../../virtual/preview-runtime/host-messaging.js'

/** Execute actual generated Vue app, rendering framework actors with controlled frame timing. */
export function createPreviewRuntimeApp(options: { storyId?: string, variantId?: string, documentId?: string, onMessage?: (message: Record<string, any>) => void } = {}) {
  const messages: Record<string, any>[] = []
  const callbacks: FrameRequestCallback[] = []
  const actorReady: (() => void)[] = []
  let paused = false
  let listener: (event: unknown) => Promise<void>
  const host = { postMessage: (message: Record<string, any>) => {
    messages.push(message)
    options.onMessage?.(message)
  } }
  const storyId = options.storyId ?? 'story'
  const variantId = options.variantId ?? 'first'
  const file = vue.reactive({ story: { id: storyId, variants: [{ id: variantId, state: {} }, { id: 'second', state: {} }] } })
  const container = document.createElement('div')
  document.body.append(container)
  const scope: Record<string, any> = {
    ...vue,
    ...protocol,
    createVariantStateSyncGuards,
    getVariantStateKey,
    initialSelection: { storyId, variantId, grid: false },
    selectionState: {},
    histoireConfig: {},
    window: {
      location: { origin: window.location.origin, search: `?documentId=${encodeURIComponent(options.documentId ?? 'document')}&selectionVersion=0` },
      frameElement: { ownerDocument: { defaultView: host } },
      /** Capture only generated runtime dispatch; pagehide services remain available. */
      addEventListener(type: string, callback: typeof listener) {
        if (type === 'message') listener = callback
      },
    },
    /** Frame timing separates framework readiness from delayed serialized snapshot publication. */
    requestAnimationFrame(callback: FrameRequestCallback) { return callbacks.push(callback) },
    usePreviewSettingsStore: () => ({ currentSettings: {} }),
    loadStoryFile: async () => file,
    clearRuntimeTestDefinitions: () => {},
    clearStaleRuntimeReloadGuard: () => {},
    observeRuntimeLayout: () => ({ refresh() {}, close() {} }),
    installRuntimeHostChannels: () => ({ receive() {}, close() {} }),
    installRuntimeEventScope: () => () => {},
    createRuntimeState: () => ({ capture() {} }),
    createRuntimeStatePresets: () => ({ restoreSelected() {} }),
    toRawDeep: (value: unknown) => value,
    postVariantStateSnapshot: () => {},
    postVariantStateSnapshotById: () => {},
    GenericMountStory: vue.defineComponent({ render: () => null }),
    GenericRenderStory: vue.defineComponent({
      props: ['variant'],
      emits: ['ready'],
      /** Stand-in framework renderer uses real Vue mount timing and readiness event. */
      setup(props, { emit }) {
        vue.onMounted(() => paused ? actorReady.push(() => emit('ready')) : emit('ready'))
        return () => vue.h('p', props.variant.id)
      },
    }),
  }
  const globals = new Proxy(scope, {
    has: () => true,
    get: (target, key) => key in target ? target[key as string] : (globalThis as any)[key],
  })
  // eslint-disable-next-line no-new-func -- production runtime is generated source.
  const app = new Function('scope', `with (scope) { ${previewHostMessaging()}\n${previewComponents()}\n${previewApp()}\nreturn app }`)(globals) as vue.App
  app.mount(container)
  return {
    messages,
    /** Returning cached variant still waits for its newly mounted renderer. */
    pauseRendering() { paused = true },
    /** Framework readiness is independent from delayed snapshot publication. */
    renderReady() { for (const ready of actorReady.splice(0)) ready() },
    /** Allow app initialization and renderer's two-tick snapshot wait to reach next frame. */
    async ticks() {
      for (let index = 0; index < 6; index++) await vue.nextTick()
    },
    /** Advance actual generated snapshot wait without arbitrary timer sleeps. */
    async frames() {
      for (let index = 0; index < 6; index++) {
        await vue.nextTick()
        for (const callback of callbacks.splice(0)) callback(index)
      }
    },
    /** Exact trusted host identity exercises production dispatch guard. */
    select(variantId: string, selectionVersion: number) {
      return listener!({ source: host, origin: window.location.origin, data: { __histoire: true, type: protocol.PREVIEW_SYNC, storyId, variantId, documentId: options.documentId ?? 'document', selectionVersion, grid: false } })
    },
    /** Vue watchers and fixture elements belong to this app alone. */
    close() {
      app.unmount()
      container.remove()
    },
  }
}
