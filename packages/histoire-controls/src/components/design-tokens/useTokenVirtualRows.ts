import type { ComputedRef, Ref, VNodeRef } from 'vue'
import type { ProcessedToken } from './tokens'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { createVirtualRowMetrics, getGridColumnCount, getVirtualRowRangeFromMetrics, groupTokenRows } from './token-window'

/** Layout and row sizing inputs for one opt-in token virtualizer. */
export interface TokenVirtualRowsOptions {
  /** Root in the same iframe document whose native scrolling is observed. */
  container: Ref<HTMLElement | undefined>
  /** Ordered tokens already processed by the public grid/list component. */
  tokens: ComputedRef<readonly ProcessedToken[]>
  /** Grid rows reflow by measured canvas width; list rows remain one token each. */
  layout: ComputedRef<'grid' | 'list'>
  /** Grid column width, matching HstTokenGrid's existing option. */
  colSize: ComputedRef<number>
  /** Approximate row size used until browser measurement arrives. */
  estimatedRowSize: ComputedRef<number | undefined>
  /** Number of extra measured rows retained around native viewport. */
  overscan: ComputedRef<number>
}

/** A row and its spacer before that row in the native document flow. */
export interface RenderedTokenRow {
  /** Stable row identity. */
  row: { key: string, tokens: readonly ProcessedToken[] }
  /** Current index in logical row order. */
  index: number
  /** Omitted measured/estimated extent before this rendered row. */
  offsetBefore: number
}

/** Visible rows and spacer dimensions used by the component template. */
export interface RenderedTokenRows {
  /** Visible window plus any focused row, sorted in source order. */
  entries: RenderedTokenRow[]
  /** Omitted extent before first rendered entry. */
  offsetTop: number
  /** Omitted extent after last rendered entry. */
  offsetBottom: number
}

const focusableSelector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])'

/** Share measured native scrolling, responsive grouping, and focus ownership across token layouts. */
export function useTokenVirtualRows(options: TokenVirtualRowsOptions) {
  const { container, tokens, layout, colSize, estimatedRowSize, overscan } = options
  const width = ref(0)
  const scrollOffset = ref(0)
  const viewportSize = ref(640)
  const measurements = reactive(new Map<string, number>())
  const focusedTokenKey = ref<string>()
  const rowElements = new Map<string, HTMLElement>()
  const rowRefCallbacks = new Map<string, VNodeRef>()
  let resizeObserver: ResizeObserver | undefined
  let scrollWindow: Window | undefined
  let animationFrame = 0
  let focusFrame = 0
  let active = true
  let focusRestore: { key: string, actionIndex: number, previous: Element } | undefined

  /** Number of CSS auto-fill columns available at current root width. */
  const columns = computed(() => layout.value === 'grid' ? getGridColumnCount(width.value, colSize.value) : 1)
  /** Responsive groups preserve token order and receive fresh identities after reflow. */
  const rows = computed(() => groupTokenRows(tokens.value, columns.value))
  /** Unknown rows use estimates until ResizeObserver measures their full border box. */
  const rowSizes = computed(() => rows.value.map(row => measurements.get(row.key) ?? 0))
  const estimate = computed(() => estimatedRowSize.value ?? (layout.value === 'grid' ? 240 : 144))
  /** Prefix sums update only when rows or measurements change, never on each scroll. */
  const metrics = computed(() => createVirtualRowMetrics(rowSizes.value, estimate.value))
  /** Complete extent is represented by row boxes and explicit spacer elements. */
  const totalSize = computed(() => metrics.value.totalSize)
  /** Visible interval stays attached to the iframe document's native scroll position. */
  const range = computed(() => getVirtualRowRangeFromMetrics(metrics.value, scrollOffset.value, viewportSize.value, overscan.value))
  /** A focused token remains mounted as a separate island while the user scrolls away. */
  const focusedIndex = computed(() => focusedTokenKey.value
    ? rows.value.findIndex(row => row.tokens.some(token => token.key === focusedTokenKey.value))
    : -1)

  /** Build ordered visible islands and spacers without filling the gap to a pinned row. */
  const rendered = computed<RenderedTokenRows>(() => {
    const indexes = new Set<number>()
    for (let index = range.value.start; index < range.value.end; index++) indexes.add(index)
    if (focusedIndex.value >= 0) indexes.add(focusedIndex.value)

    const offsets = metrics.value.offsets
    const entries: RenderedTokenRow[] = []
    let previousEnd = 0
    for (const index of [...indexes].sort((a, b) => a - b)) {
      entries.push({ row: rows.value[index], index, offsetBefore: entries.length ? offsets[index] - offsets[previousEnd] : 0 })
      previousEnd = index + 1
    }

    return {
      entries,
      offsetTop: entries.length ? offsets[entries[0].index] : totalSize.value,
      offsetBottom: entries.length ? totalSize.value - offsets[previousEnd] : 0,
    }
  })

  /** Read root width and visible document interval after native geometry changes. */
  function updateViewport(): void {
    const root = container.value
    const view = root?.ownerDocument.defaultView
    if (!root || !view) return

    const bounds = root.getBoundingClientRect()
    const measuredWidth = root.clientWidth || bounds.width || view.innerWidth
    if (measuredWidth > 0) width.value = measuredWidth

    const documentTop = bounds.top + view.scrollY
    const documentBottom = documentTop + totalSize.value
    const viewportTop = view.scrollY
    const viewportHeight = view.innerHeight || root.ownerDocument.documentElement.clientHeight || 640
    const viewportBottom = viewportTop + viewportHeight
    const visibleTop = Math.max(documentTop, viewportTop)
    const visibleBottom = Math.min(documentBottom, viewportBottom)
    scrollOffset.value = Math.max(0, viewportTop - documentTop)
    viewportSize.value = Math.max(0, visibleBottom - visibleTop)
  }

  /** Coalesce native scroll and resize work to one animation frame. */
  function scheduleViewportUpdate(): void {
    if (!scrollWindow || animationFrame) return
    animationFrame = scrollWindow.requestAnimationFrame(() => {
      animationFrame = 0
      updateViewport()
    })
  }

  /** Measure a row's full rendered height, including its layout gap. */
  function measureRow(key: string, element: HTMLElement): void {
    const height = element.getBoundingClientRect().height || element.offsetHeight
    if (height > 0 && Math.abs((measurements.get(key) ?? 0) - height) > 0.5) measurements.set(key, height)
  }

  /** Observe border-box changes so padding and variable sample height stay measured. */
  function observeRow(element: HTMLElement): void {
    try {
      resizeObserver?.observe(element, { box: 'border-box' })
    }
    catch {
      resizeObserver?.observe(element)
    }
    const key = element.dataset.tokenVirtualRow
    if (key) measureRow(key, element)
  }

  /** Keep row observation aligned with Vue's keyed mount and retirement lifecycle. */
  function setRowElement(key: string, element: HTMLElement | null): void {
    const previous = rowElements.get(key)
    if (previous === element) return
    if (previous) {
      resizeObserver?.unobserve(previous)
      rowElements.delete(key)
    }
    if (!element) return

    rowElements.set(key, element)
    if (resizeObserver) observeRow(element)
    else measureRow(key, element)
  }

  /** Return stable row refs so scroll-driven patches do not churn ResizeObserver. */
  function getRowElementRef(key: string): VNodeRef {
    let callback = rowRefCallbacks.get(key)
    if (!callback) {
      callback = (element) => {
        const row = element instanceof HTMLElement ? element : null
        setRowElement(key, row)
        if (!row) rowRefCallbacks.delete(key)
      }
      rowRefCallbacks.set(key, callback)
    }
    return callback
  }

  /** Keep the token containing keyboard focus as one bounded, independent render island. */
  function retainFocusedToken(event: FocusEvent): void {
    if (focusFrame && scrollWindow) scrollWindow.cancelAnimationFrame(focusFrame)
    focusFrame = 0
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-token-virtual-key]') : null
    focusedTokenKey.value = target?.dataset.tokenVirtualKey
  }

  /** Release the focus pin only after focus has left the virtualized token root. */
  function releaseFocusedToken(event: FocusEvent): void {
    const root = container.value
    const next = event.relatedTarget
    if (root && next instanceof Node && root.contains(next)) return
    const view = root?.ownerDocument.defaultView
    if (!view) {
      focusedTokenKey.value = undefined
      return
    }
    if (focusFrame) view.cancelAnimationFrame(focusFrame)
    focusFrame = view.requestAnimationFrame(() => {
      focusFrame = 0
      if (!active) return
      if (!container.value?.contains(container.value.ownerDocument.activeElement)) focusedTokenKey.value = undefined
    })
  }

  /** Start one observer and the native iframe-document scroll listeners. */
  onMounted(() => {
    const root = container.value
    const view = root?.ownerDocument.defaultView
    if (!root || !view) return

    scrollWindow = view
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        if (!active) return
        for (const entry of entries) {
          if (entry.target === container.value) {
            const nextWidth = entry.contentRect.width || container.value?.clientWidth || 0
            if (nextWidth > 0) width.value = nextWidth
          }
          else {
            const row = entry.target as HTMLElement
            const key = row.dataset.tokenVirtualRow
            if (key) measureRow(key, row)
          }
        }
        updateViewport()
      })
      resizeObserver.observe(root)
      for (const element of rowElements.values()) observeRow(element)
    }
    view.addEventListener('scroll', scheduleViewportUpdate, { passive: true })
    view.addEventListener('resize', scheduleViewportUpdate, { passive: true })
    updateViewport()
  })

  /** Drop stale measurements and refresh active rows after filter or responsive changes. */
  watch(rows, async (nextRows) => {
    if (!active) return
    const root = container.value
    const previous = root?.ownerDocument.activeElement
    const activeCell = previous instanceof Element ? previous.closest<HTMLElement>('[data-token-virtual-key]') : null
    const activeKey = activeCell?.dataset.tokenVirtualKey
    if (previous && root?.contains(previous) && activeKey && nextRows.some(row => row.tokens.some(token => token.key === activeKey))) {
      const actions = Array.from(activeCell.querySelectorAll<HTMLElement>(focusableSelector))
      focusRestore = { key: activeKey, actionIndex: Math.max(0, actions.indexOf(previous as HTMLElement)), previous }
    }
    const currentKeys = new Set(nextRows.map(row => row.key))
    for (const key of measurements.keys()) {
      if (!currentKeys.has(key)) measurements.delete(key)
    }
    if (focusedTokenKey.value && !nextRows.some(row => row.tokens.some(token => token.key === focusedTokenKey.value))) focusedTokenKey.value = undefined
    await nextTick()
    if (!active) return
    for (const [key, element] of rowElements) measureRow(key, element)
    const restore = focusRestore
    focusRestore = undefined
    const document = container.value?.ownerDocument
    const currentFocus = document?.activeElement
    if (restore && document && (currentFocus === restore.previous || currentFocus === document.body || currentFocus === document.documentElement)) {
      const cell = Array.from(container.value?.querySelectorAll<HTMLElement>('[data-token-virtual-key]') ?? [])
        .find(element => element.dataset.tokenVirtualKey === restore.key)
      const actions = cell ? Array.from(cell.querySelectorAll<HTMLElement>(focusableSelector)) : []
      const action = actions[Math.min(restore.actionIndex, actions.length - 1)]
      action?.focus({ preventScroll: true })
      // Reflow can move a focused token far outside the current native viewport.
      const view = document.defaultView
      if (action && view) {
        const bounds = action.getBoundingClientRect()
        const viewportHeight = view.innerHeight || document.documentElement.clientHeight
        if ((bounds.top < 0 || bounds.bottom > viewportHeight) && typeof action.scrollIntoView === 'function') {
          action.scrollIntoView({ block: 'nearest' })
        }
      }
    }
    updateViewport()
  }, { flush: 'pre' })

  /** Disconnect every observer and listener once when this document node retires. */
  onBeforeUnmount(() => {
    active = false
    resizeObserver?.disconnect()
    resizeObserver = undefined
    if (scrollWindow) {
      scrollWindow.removeEventListener('scroll', scheduleViewportUpdate)
      scrollWindow.removeEventListener('resize', scheduleViewportUpdate)
      if (animationFrame) scrollWindow.cancelAnimationFrame(animationFrame)
      if (focusFrame) scrollWindow.cancelAnimationFrame(focusFrame)
    }
    animationFrame = 0
    focusFrame = 0
    focusRestore = undefined
    scrollWindow = undefined
    rowElements.clear()
    rowRefCallbacks.clear()
  })

  return { columns, rows, rendered, getRowElementRef, retainFocusedToken, releaseFocusedToken }
}
