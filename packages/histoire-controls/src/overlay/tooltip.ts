import type { HistoireControlsOverlayHandle } from '@histoire/shared'
import type { DirectiveBinding, ObjectDirective } from 'vue'
import { getControlsHost } from '@histoire/shared'
import { useEventListener } from '@vueuse/core'
import { VTooltip as FloatingTooltip } from 'floating-vue'

/** Built-in controls use text tooltips; HTML remains outside this adapter. */
interface TooltipOptions {
  /** Plain tooltip content. */
  content?: string | number
  /** Explicit visibility for copy feedback and slider values. */
  shown?: boolean
  /** Hover and focus listeners; an empty array disables automatic triggers. */
  triggers?: string[]
  /** Requested side of the anchor. */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** Gap from the anchor. */
  distance?: number
  /** Delay before showing a hover tooltip. */
  delay?: number | { show?: number }
}

/** Host tooltip lifecycle attached to one directive element. */
interface TooltipSession {
  /** Applies new directive options, including explicit visibility. */
  update: (binding: DirectiveBinding) => void
  /** Removes listeners, timers and any open overlay. */
  dispose: () => void
}

const sessions = new WeakMap<HTMLElement, TooltipSession>()

/** Installs text tooltip events while keeping lifecycle ownership in the sandbox. */
function createTooltipSession(element: HTMLElement, binding: DirectiveBinding): TooltipSession {
  const host = getControlsHost()!
  let options: TooltipOptions
  let hovered = false
  let focused = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let overlay: HistoireControlsOverlayHandle | undefined

  /** Reconciles explicit or pointer/focus visibility with the host overlay. */
  function refresh() {
    const content = options.content == null ? '' : String(options.content)
    const visible = options.shown ?? (hovered || focused)
    if (!visible || !content) {
      overlay?.close()
      overlay = undefined
      return
    }
    const value = { kind: 'tooltip' as const, content, placement: options.placement, distance: options.distance }
    if (overlay) {
      overlay.update(value)
    }
    else {
      overlay = host.open(element, value, () => {
        overlay = undefined
      })
    }
  }

  /** Cancels deferred hover work before an update or disposal. */
  function cancelTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  const stopEnter = useEventListener(element, 'mouseenter', () => {
    if (!(options.triggers ?? ['hover', 'focus']).includes('hover')) return
    hovered = true
    cancelTimer()
    const delay = typeof options.delay === 'number' ? options.delay : options.delay?.show ?? 200
    timer = setTimeout(refresh, delay)
  })
  const stopLeave = useEventListener(element, 'mouseleave', () => {
    hovered = false
    cancelTimer()
    refresh()
  })
  const stopFocus = useEventListener(element, 'focusin', () => {
    if (!(options.triggers ?? ['hover', 'focus']).includes('focus')) return
    focused = true
    refresh()
  })
  const stopBlur = useEventListener(element, 'focusout', () => {
    focused = false
    refresh()
  })

  /** Reads string shorthand and explicit visibility from each directive update. */
  function update(binding: DirectiveBinding) {
    options = typeof binding.value === 'object' && binding.value !== null ? binding.value : { content: binding.value }
    refresh()
  }
  update(binding)
  return {
    update,
    /** Releases pending hover work and listeners owned by this directive. */
    dispose() {
      cancelTimer()
      overlay?.close()
      stopEnter()
      stopLeave()
      stopFocus()
      stopBlur()
    },
  }
}

/** Delegates ordinary previews to Floating Vue and sandbox controls to the host. */
export const VTooltip: ObjectDirective<HTMLElement> = Object.fromEntries(
  ['beforeMount', 'mounted', 'updated', 'beforeUnmount'].map(hook => [hook, (...args: any[]) => {
    const [element, binding] = args
    if (!getControlsHost() && !sessions.has(element)) {
      const original = (FloatingTooltip as ObjectDirective)[hook]
      if (typeof original === 'function') original(...args)
      return
    }
    if (hook === 'mounted') {
      sessions.set(element, createTooltipSession(element, binding))
    }
    else if (hook === 'updated') {
      sessions.get(element)?.update(binding)
    }
    else if (hook === 'beforeUnmount') {
      sessions.get(element)?.dispose()
      sessions.delete(element)
    }
  }]),
)
