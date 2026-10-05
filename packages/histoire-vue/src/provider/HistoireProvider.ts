import type { HistoireSession } from '@histoire/sdk'
import type { PropType } from 'vue'
import { provideHistoireControls } from '@histoire/controls/vue'
import { getHistoireSessionDescriptor } from '@histoire/sdk/internal'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, provide, readonly, shallowRef, toRaw, watch } from 'vue'
import { histoireContextKey } from './context.js'
import { createHistoirePanelNavigation } from './panels.js'
import { getHistoireThemeVariables } from './theme.js'

/** Explicit session provider with local theme, overlay, measurement and resource ownership. */
export const HistoireProvider = defineComponent({
  name: 'HistoireProvider',
  inheritAttrs: false,
  props: {
    /** Caller connects/disposes this controller. */
    session: { type: Object as PropType<HistoireSession>, required: true },
  },
  emits: {
    /** Async child mount/cleanup failures; never dropped as unhandled rejections. */
    error: (_error: unknown) => true,
  },
  setup(props, { attrs, slots, emit }) {
    const root = shallowRef<HTMLElement | null>(null)
    const overlay = shallowRef<HTMLElement | null>(null)
    const size = shallowRef({ width: 0, height: 0 })
    const snapshot = shallowRef(props.session.getSnapshot())
    const panels = createHistoirePanelNavigation(() => toRaw(props.session).getSnapshot())
    const generation = shallowRef(0)
    const systemDark = shallowRef(false)
    const dark = computed(() => snapshot.value.settings.colorScheme === 'dark' || (snapshot.value.settings.colorScheme === 'auto' && systemDark.value))
    const paletteRevision = computed(() => snapshot.value.status === 'ready' && snapshot.value.source ? JSON.stringify([snapshot.value.source.epoch, snapshot.value.source.revision]) : '')
    const theme = computed(() => {
      // Detached descriptor is read only on coherent source revision/session change,
      // avoiding catalog copies on every state edit or event publication.
      return getHistoireThemeVariables(paletteRevision.value ? getHistoireSessionDescriptor(toRaw(props.session)).config : undefined, dark.value)
    })
    const resources = new Set<() => void>()
    /** One subscription publishes both canonical snapshot and local navigation retirement. */
    function synchronize(value: ReturnType<HistoireSession['getSnapshot']>) {
      panels.synchronize(value)
      snapshot.value = value
    }
    let stop = props.session.subscribe(synchronize)
    let observer: ResizeObserver | undefined
    let removed = false
    let stopMedia: (() => void) | undefined

    /** Observe teardown failures and report child errors through live provider boundary. */
    function reportError(error: unknown) {
      emit('error', error)
    }

    /** Capture one teardown immediately, release once even if both scopes unmount. */
    function own(cleanup: () => void | Promise<void>) {
      let active = true
      const dispose = () => {
        if (!active) return
        active = false
        resources.delete(dispose)
        try {
          Promise.resolve(cleanup()).catch(reportError)
        }
        catch (error) { reportError(error) }
      }
      if (removed) dispose()
      else resources.add(dispose)
      return dispose
    }
    // Descendants remount when the explicit caller changes sessions. Their
    // composables therefore retain direct session access without prop drilling.
    const context = {
      get session() {
        // Host refs/props may proxy session. Internal ownership belongs to the
        // caller's exact controller object, never Vue's reactive wrapper.
        return toRaw(props.session)
      },
      root,
      overlay,
      size: readonly(size),
      panels,
      own,
      reportError,
    }
    provide(histoireContextKey, context)
    provideHistoireControls({ overlay, dark })
    watch(() => props.session, (session) => {
      for (const dispose of Array.from(resources)) dispose()
      stop()
      panels.clear()
      snapshot.value = session.getSnapshot()
      stop = session.subscribe(synchronize)
      generation.value++
    }, { flush: 'sync' })

    onMounted(() => {
      if (!root.value) return
      const media = root.value.ownerDocument.defaultView?.matchMedia?.('(prefers-color-scheme: dark)')
      if (media) {
        systemDark.value = media.matches
        const change = (event: MediaQueryListEvent) => systemDark.value = event.matches
        media.addEventListener('change', change)
        stopMedia = () => media.removeEventListener('change', change)
      }
      const bounds = root.value.getBoundingClientRect()
      size.value = { width: bounds.width, height: bounds.height }
      const Observer = root.value.ownerDocument.defaultView?.ResizeObserver
      if (Observer) {
        observer = new Observer((entries) => {
          const bounds = entries[0]?.contentRect
          if (bounds) size.value = { width: bounds.width, height: bounds.height }
        })
        observer.observe(root.value)
      }
    })
    onBeforeUnmount(() => {
      removed = true
      observer?.disconnect()
      stopMedia?.()
      stop()
      for (const dispose of Array.from(resources)) dispose()
      panels.close()
    })
    return () => h('div', {
      ...attrs,
      'ref': root,
      'class': ['histoire-provider', { 'htw-dark': dark.value }, attrs.class],
      'data-histoire-appearance': dark.value ? 'dark' : 'light',
      'dir': snapshot.value.settings.textDirection,
      'style': [theme.value, attrs.style],
    }, [
      h('div', { class: 'histoire-provider-content', key: generation.value }, slots.default?.()),
      h('div', { 'ref': overlay, 'class': 'histoire-provider-overlays', 'data-histoire-overlay': '' }),
    ])
  },
})
