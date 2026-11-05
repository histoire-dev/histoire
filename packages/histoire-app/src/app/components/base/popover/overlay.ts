import type { InjectionKey, Ref } from 'vue'
import { useHistoireControls } from '@histoire/controls/vue'
import { computed, inject, provide } from 'vue'

/** Reactive owning surface; native dialogs override the workbench overlay. */
export type PopoverOverlay = Readonly<Ref<HTMLElement | string | null | undefined>>

/** Local overlay ownership, independent of marketplace navigation state. */
const popoverOverlayKey: InjectionKey<PopoverOverlay> = Symbol('popover-overlay')

/** Keep descendant popovers inside a native dialog's top layer. */
export function providePopoverOverlay(target: PopoverOverlay): void {
  provide(popoverOverlayKey, target)
}

/** Resolve local surface, then HistoireProvider's shared controls overlay. */
export function usePopoverOverlay() {
  const target = inject(popoverOverlayKey, undefined)
  const controls = useHistoireControls()
  return computed(() => target?.value ?? controls?.overlay.value ?? 'body')
}
