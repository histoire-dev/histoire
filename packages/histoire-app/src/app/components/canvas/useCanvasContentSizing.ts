import type { HistoireSession } from '@histoire/sdk'
import type { Ref } from 'vue'
import type { CanvasStore } from '../../stores/canvas.js'
import { computed, onBeforeUnmount, watch } from 'vue'
import { observeCanvasContentSize } from './content-measure.js'
import { canvasContentKey } from './content-sizes.js'

/** Bind intrinsic measurement to restored replica ownership, including Matrix acknowledgement. */
export function useCanvasContentSizing(options: {
  /** Nearest workbench owns mode and transient cache. */
  canvas: CanvasStore
  /** Canonical source generation and manual dimensions. */
  canonical: HistoireSession
  /** Current snapshot supplied by provider, independent of child replica updates. */
  snapshot: Ref<ReturnType<HistoireSession['getSnapshot']>>
  /** Replica container provides its actual same-origin sandbox. */
  container: Ref<HTMLElement | undefined>
  /** Runtime restoration completed for current actor. */
  ready: Ref<boolean>
  /** Current exact rendered cell/variant target. */
  target: () => { frameId: string, storyId: string, variantId: string, propsOverride?: Record<string, unknown> }
  /** Matrix sizing starts only after current props acknowledgement. */
  wait: () => Promise<void>
}) {
  const key = computed(() => canvasContentKey(options.snapshot.value, options.target(), options.target().propsOverride))
  let stop = () => {}
  let generation = 0
  let ownedDocument: Document | null | undefined
  let ownedIdentity = ''

  /** Repeated readiness publications must not replace an already-owned observer. */
  function refresh(): void {
    const target = options.target()
    const identity = options.canvas.autoFitContent && options.ready.value && key.value ? JSON.stringify([key.value, target.frameId]) : ''
    const document = options.container.value?.querySelector('iframe')?.contentDocument
    if (identity === ownedIdentity && document === ownedDocument) return
    stop()
    stop = () => {}
    const token = ++generation
    ownedIdentity = identity
    ownedDocument = document
    if (!identity || !document) return
    const capturedKey = key.value
    const current = () => token === generation && options.canvas.autoFitContent && options.ready.value && options.container.value?.querySelector('iframe')?.contentDocument === document && key.value === capturedKey
    void options.wait().then(() => {
      if (!current()) return
      const settings = options.canonical.getSnapshot().settings
      stop = observeCanvasContentSize({
        document,
        variantId: target.variantId,
        fallback: { width: settings.rotate && settings.responsiveHeight ? settings.responsiveHeight : settings.responsiveWidth, height: settings.rotate ? settings.responsiveWidth : settings.responsiveHeight ?? 640 },
        isCurrent: current,
        publish: size => options.canvas.contentSizes.set(target.frameId, capturedKey, size),
      })
    }).catch(() => {})
  }

  watch([key, options.ready, () => options.canvas.autoFitContent, () => options.target().frameId], refresh, { flush: 'post' })
  onBeforeUnmount(() => {
    generation++
    stop()
  })
  return {
    key,
    refresh,
    /** Current measured viewport is local to this replica, never canonical settings. */
    size: computed(() => options.canvas.autoFitContent ? options.canvas.contentSizes.get(options.target().frameId, key.value) : undefined),
  }
}
