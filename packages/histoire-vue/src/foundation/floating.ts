import { Dropdown, Tooltip } from 'floating-vue'
import { defineComponent, h, mergeProps, nextTick, onMounted, shallowRef } from 'vue'
import { useHistoireContext, useHistoireResource } from '../provider/context.js'

/** FloatingVue exposes local hide method and root element for scoped keyboard handling. */
interface LocalFloatingInstance {
  /** Local trigger wrapper, used when browser clicks do not focus buttons. */
  $el: HTMLElement
  /** Dismiss current overlay without a delayed keyboard transition. */
  hide: (options: { skipDelay: boolean }) => void
  /** Refresh positioning after scoped virtual anchor moves. */
  onResize: () => void | Promise<void>
}

/** Local FloatingVue component with teleport constrained to owning provider. */
function createLocalFloating(name: string, component: typeof Dropdown | typeof Tooltip) {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_props, { attrs, slots, expose }) {
      const context = useHistoireContext()
      const floating = shallowRef<LocalFloatingInstance | null>(null)
      let shown = false
      let active = true
      let visibilityVersion = 0
      let anchor: HTMLElement | undefined
      let root: HTMLElement | null = null
      expose({ onResize: () => floating.value?.onResize() })
      /** Capture this trigger's keyboard origin, never a neighboring provider control. */
      function onShow() {
        shown = true
        visibilityVersion++
        const trigger = floating.value?.$el
        const focused = trigger?.ownerDocument.activeElement
        // Pointer activation in Firefox need not move focus. Fall back to
        // this wrapper's own trigger rather than retaining another control.
        anchor = focused && trigger?.contains(focused)
          ? focused as HTMLElement
          : trigger?.querySelector<HTMLElement>('button, a[href], input, select, textarea, [tabindex]') ?? undefined
      }
      /** Forget focus ownership once this overlay closes by click or lifecycle. */
      function onHide() {
        shown = false
        visibilityVersion++
      }
      /** Vendor autofocus runs after animation frames even if hidden; own guarded focus instead. */
      function onApplyShow() {
        const optOut = attrs.noAutoFocus ?? attrs['no-auto-focus']
        if (optOut || optOut === '') return
        const instance = floating.value
        const version = visibilityVersion
        void nextTick().then(() => {
          if (!active || !shown || version !== visibilityVersion || floating.value !== instance) return
          const trigger = instance?.$el
          const id = trigger?.getAttribute('aria-describedby') ?? trigger?.querySelector('[aria-describedby]')?.getAttribute('aria-describedby')
          if (!id) return
          // Exact scoped ID avoids host collisions and keeps default tooltip
          // behavior: without autoHide its popper has no focusable tabindex.
          const popper = Array.from(root?.querySelectorAll<HTMLElement>('[id]') ?? []).find(element => element.id === id)
          if (popper?.isConnected) popper.focus()
        }).catch(context.reportError)
      }
      /** Escape never reaches another provider or unrelated host shortcuts. */
      function onKeydown(event: KeyboardEvent) {
        if (!shown || event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        floating.value?.hide({ skipDelay: true })
        if (anchor?.isConnected) anchor.focus()
      }
      onMounted(() => {
        root = context.root.value
        root?.addEventListener('keydown', onKeydown)
      })
      useHistoireResource(() => {
        active = false
        shown = false
        visibilityVersion++
        root?.removeEventListener('keydown', onKeydown)
      })
      return () => h(component, mergeProps(attrs, {
        ref: floating,
        container: context.overlay.value ?? false,
        onShow,
        onHide,
        onApplyShow,
        noAutoFocus: true,
      }), slots)
    },
  })
}

/** Native dropdown with provider-owned teleport and no host plugin installation. */
export const HistoireDropdown = createLocalFloating('HistoireDropdown', Dropdown)
/** Native tooltip with provider-owned teleport and no global configuration. */
export const HistoireTooltip = createLocalFloating('HistoireTooltip', Tooltip)
