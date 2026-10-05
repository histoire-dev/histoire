import type { HistoireBridgePublication, HistoireControlsOverlayMessage, HistoireControlsOverlayResult } from '@histoire/protocol'
import type { HistoireMount } from '@histoire/sdk'
import type { HistoireStatePresetsHandle } from './StatePresets.js'
import { HstButton, restoreControlsFocus } from '@histoire/controls/vue'
import { configureHistoireMountControls, postHistoireMountEvent, subscribeHistoireMountEvents } from '@histoire/sdk/internal'
import { defineComponent, h, onMounted, shallowRef, watch } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { HistoireControlsOverlayHost } from '../../overlays/OverlayHost.js'
import { useHistoireContext, useHistoireResource } from '../../provider/context.js'
import { GenericControls } from './GenericControls.js'
import { StatePresets } from './StatePresets.js'
/** Native generic editors and explicit source-owned custom-controls replica. */
export const HistoireControls = defineComponent({
  name: 'HistoireControls',
  props: {
    /** First-party compact inspector keeps preset management behind disclosure. */
    compactPresets: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    const context = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const container = shallowRef<HTMLElement | null>(null)
    const overlay = shallowRef<HistoireControlsOverlayMessage | null>(null)
    const presets = shallowRef<HistoireStatePresetsHandle | null>(null)
    const hasControls = shallowRef<boolean | undefined>()
    const failure = shallowRef<unknown>(null)
    let mount: HistoireMount | undefined
    let off = () => {
    }
    let client = false
    let removed = false
    let closing = Promise.resolve()
    /** Teardown invalidates UI immediately; stale focus/height cannot reach replacement. */
    function unmount(): Promise<void> {
      const current = mount
      mount = undefined
      overlay.value = null
      hasControls.value = undefined
      failure.value = null
      off()
      off = () => {
      }
      if (current) {
        closing = current.unmount().catch(context.reportError)
      }
      return closing
    }
    /** Only active menu may resolve local opaque choice. */
    function result(id: string, value: HistoireControlsOverlayResult): void {
      if (!mount || overlay.value?.id !== id) {
        return
      }
      overlay.value = null
      postHistoireMountEvent(mount, 'overlay.result', { id, ...value })
    }
    /** SDK internal seam already validates port/source/canonical document ownership. */
    function receive(event: HistoireBridgePublication): void {
      const value = event.payload as any
      if (event.event === 'overlay.close') {
        if (overlay.value?.id === value.id) {
          overlay.value = null
        }
      }
      else if (event.event === 'overlay.open' || event.event === 'overlay.update') {
        if (event.event === 'overlay.update' && overlay.value?.id !== value.id) return
        overlay.value = { ...value, type: '__histoire:controls-overlay', storyId: event.target!.storyId, variantId: event.target!.variantId! }
      }
      else if (event.event === 'controls.height') {
        if (typeof value.hasControls === 'boolean') {
          hasControls.value = value.hasControls
        }
        const iframe = container.value?.querySelector('iframe')
        if (iframe) {
          iframe.style.height = `${hasControls.value ? value.height : 0}px`
        }
      }
      else if (event.event === 'focus.changed' && value.direction) {
        restoreControlsFocus(container.value?.querySelector('iframe') ?? null, { restoreFocus: true, focusDirection: value.direction })
      }
    }
    /** Primary loss is unavailable, never an invitation to create hidden runtime. */
    async function reconcile(): Promise<void> {
      const current = snapshot.value
      if (current.runtime.status !== 'ready' || !current.selection?.variantId) {
        await unmount()
        return
      }
      if (!client || removed || mount || !container.value) {
        return
      }
      await closing
      if (removed || snapshot.value.runtime.runtimeId !== current.runtime.runtimeId || mount) {
        return
      }
      try {
        mount = context.session.mount(container.value, { surface: 'controls' })
        configureHistoireMountControls(mount, true)
        off = subscribeHistoireMountEvents(mount, receive)
        const owned = mount
        // Readiness belongs to this child mount and captured primary document.
        // Navigation/unmount observes rejection without reporting stale failure.
        void owned.ready.catch(async (error) => {
          if (removed || mount !== owned || snapshot.value.runtime.runtimeId !== current.runtime.runtimeId) {
            return
          }
          context.reportError(error)
          await unmount()
          if (!removed && snapshot.value.runtime.runtimeId === current.runtime.runtimeId) {
            hasControls.value = false
            failure.value = error
          }
        })
      }
      catch (error) {
        if (removed || snapshot.value.runtime.runtimeId !== current.runtime.runtimeId) return
        context.reportError(error)
        // Configuration/subscription may fail after a child was acquired.
        // Join its teardown before Retry can acquire another replica.
        await unmount()
        if (!removed && snapshot.value.runtime.runtimeId === current.runtime.runtimeId) {
          hasControls.value = false
          failure.value = error
        }
      }
    }
    watch([() => snapshot.value.runtime.runtimeId, () => snapshot.value.runtime.status, () => snapshot.value.selection?.storyId, () => snapshot.value.selection?.variantId], () => {
      overlay.value = null
      failure.value = null
      void reconcile()
    }, { flush: 'sync' })
    onMounted(() => {
      client = true
      void reconcile()
    })
    useHistoireResource(() => {
      removed = true
      return unmount()
    })
    return () => h('section', { 'class': 'histoire-controls', 'aria-label': 'Controls' }, [
      snapshot.value.runtime.status !== 'ready' || !snapshot.value.selection?.variantId
        ? (slots.unavailable?.() ?? h('div', { role: 'status' }, 'Preview unavailable'))
        : [h(GenericControls, { showState: hasControls.value !== true }), h(StatePresets, { ref: presets, compact: props.compactPresets }), h(HstButton, { color: 'flat', type: 'button', class: 'histoire-controls-reset', disabled: !presets.value || presets.value.busy(), onClick: () => {
            void presets.value?.reset()
          } }, { default: () => 'Reset state' })],
      failure.value
        ? h('div', { class: 'histoire-controls-failure' }, [
            h('p', { role: 'alert' }, `Custom controls unavailable: ${(failure.value as Error)?.message ?? String(failure.value)}`),
            h(HstButton, { color: 'flat', type: 'button', onClick: () => {
              failure.value = null
              hasControls.value = undefined
              void reconcile()
            } }, { default: () => 'Retry controls' }),
          ])
        : null,
      // Keep unknown replica in rendered viewport until real controls ready.
      // Generic detected state may otherwise push its 1px boot frame offscreen,
      // where browsers suspend the rAF used by actual framework readiness.
      h('div', { 'ref': container, 'class': 'histoire-custom-controls', 'data-test-id': 'story-controls-sandbox', 'style': hasControls.value === undefined
        ? { position: 'fixed', left: '0', top: '0', opacity: 0, pointerEvents: 'none', width: `${context.root.value?.clientWidth ?? 420}px`, height: '32px', zIndex: -2147483647 }
        : { visibility: hasControls.value ? 'visible' : 'hidden', height: hasControls.value ? 'auto' : '1px' } }),
      overlay.value ? h(HistoireControlsOverlayHost, { key: overlay.value.id, request: overlay.value, onResult: result }) : null,
    ])
  },
})
