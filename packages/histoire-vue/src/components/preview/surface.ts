import type { HistoireMount } from '@histoire/sdk'
import { HistoireSdkError } from '@histoire/protocol'
import { isHistoirePrimaryMountActive, subscribeHistoireMountEvents } from '@histoire/sdk/internal'
import { defineComponent, h, onMounted, shallowRef } from 'vue'
import { useHistoireContext, useHistoireResource } from '../../provider/context.js'
import { focusHistoireSearch } from '../../provider/shortcuts.js'

/** Build native primary wrapper around SDK-owned source runtime; no host story imports. */
export function createHistoirePrimary(name: string, surface: 'preview' | 'grid') {
  return defineComponent({
    name,
    inheritAttrs: false,
    emits: {
      /** Fires after source runtime readiness, including explicit empty-book readiness. */
      ready: () => true,
      /** Typed source/runtime or primary ownership failure. */
      error: (_error: unknown) => true,
    },
    setup(_props, { attrs, slots, emit, expose }) {
      const context = useHistoireContext()
      const session = context.session
      const initial = session.getSnapshot()
      const container = shallowRef<HTMLElement | null>(null)
      const error = shallowRef<unknown>()
      const ready = shallowRef(false)
      let mount: HistoireMount | undefined
      let removed = false
      let closing: Promise<void> | undefined
      let stopFocus: (() => void) | undefined
      let stopReadiness: (() => void) | undefined
      let settled = false
      let acknowledged = false
      let selectionChanged = false
      let readyDocument: string | null | undefined
      /** Exposed teardown joins SDK ownership release before caller replaces a primary. */
      function unmount(): Promise<void> {
        removed = true
        stopFocus?.()
        stopReadiness?.()
        closing ??= mount?.unmount() ?? Promise.resolve()
        void closing.catch(() => {})
        return closing
      }
      useHistoireResource(unmount)
      /** Show failures locally and through provider's resource/error boundary. */
      function fail(value: unknown) {
        if (removed) return
        error.value = value
        emit('error', value)
        context.reportError(value)
      }
      /** Read live ownership rather than adopting a delayed observer's snapshot. */
      function currentSnapshot() {
        const snapshot = session.getSnapshot()
        if (removed || !mount || !isHistoirePrimaryMountActive(session, mount) || snapshot.source?.sourceId !== initial.source?.sourceId || snapshot.runtime.mountId !== mount.id) return
        return snapshot
      }
      /** Initial promise may retire; retained primary follows each owned document. */
      function synchronizeReadiness() {
        const snapshot = currentSnapshot()
        selectionChanged ||= snapshot?.selection?.storyId !== initial.selection?.storyId || snapshot?.selection?.variantId !== initial.selection?.variantId
        const runtime = snapshot?.runtime
        const currentReady = Boolean(settled && snapshot?.status === 'ready' && !snapshot.stale && runtime && (
          (runtime.status === 'ready' && runtime.runtimeId)
          || ((acknowledged || selectionChanged) && !snapshot.selection?.variantId && !runtime.runtimeId && ['absent', 'mounting'].includes(runtime.status))
        ))
        const notify = currentReady && (!ready.value || readyDocument !== runtime?.runtimeId)
        ready.value = currentReady
        readyDocument = currentReady ? runtime?.runtimeId : undefined
        if (currentReady) error.value = undefined
        if (notify) emit('ready')
      }
      onMounted(() => {
        if (removed || !container.value) return
        try {
          mount = session.mount(container.value, { surface })
          stopReadiness = session.subscribe(synchronizeReadiness)
          stopFocus = subscribeHistoireMountEvents(mount, (event) => {
            if (event.event === 'focus.changed' && (event.payload as { action?: string }).action === 'search') focusHistoireSearch(context.root.value)
          })
          mount.ready.then(() => {
            if (removed) return
            settled = acknowledged = true
            synchronizeReadiness()
          }, (value) => {
            const snapshot = currentSnapshot()
            if (!snapshot) return
            settled = true
            // Selecting docs/null retires initial readiness, not this live mount.
            if (value instanceof HistoireSdkError && value.code === 'RUNTIME_CHANGED' && selectionChanged && snapshot.status === 'ready' && !snapshot.stale && !['failed', 'stale'].includes(snapshot.runtime.status)) synchronizeReadiness()
            else fail(value)
          })
        }
        catch (value) { fail(value) }
      })
      expose({
        unmount,
        get mount() {
          return mount
        },
      })
      return () => h('div', { ...attrs, 'class': ['histoire-primary', attrs.class], 'data-histoire-surface': surface }, [
        // Story DOM may paint before the framework has admitted its actor. Keep
        // the viewport measurable while preventing input that cannot be owned yet.
        h('div', { 'ref': container, 'class': 'histoire-primary-frame', 'aria-busy': !ready.value && !error.value, 'inert': ready.value ? undefined : true }),
        error.value
          ? (slots.error?.({ error: error.value }) ?? h('div', { role: 'alert', class: 'histoire-primary-status' }, error.value instanceof Error ? error.value.message : 'Preview failed'))
          : !ready.value ? slots.loading?.() : null,
      ])
    },
  })
}
