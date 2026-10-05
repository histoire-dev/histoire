import type { InjectionKey, Ref } from 'vue'
import { getCurrentInstance, inject, provide } from 'vue'

/** Host-local controls context; one provider never changes another provider's theme. */
export interface HistoireControlsContext {
  /** Scoped teleport root; null before client mount. */
  overlay: Ref<HTMLElement | null>
  /** Host-owned appearance projected from session settings. */
  dark: Readonly<Ref<boolean>>
}

/** Shared component sources consume this same key in both controls builds. */
const controlsContextKey: InjectionKey<HistoireControlsContext> = Symbol('HistoireControls')

/** Supply per-tree theme/teleport ownership without installing a global plugin. */
export function provideHistoireControls(context: HistoireControlsContext): void {
  provide(controlsContextKey, context)
}

/** Resolve local host ownership during component setup; ordinary story controls stay compatible. */
export function useHistoireControls(): HistoireControlsContext | undefined {
  return getCurrentInstance() ? inject(controlsContextKey, undefined) : undefined
}

/** Tooltip directives run outside setup, so resolve only their own provider's DOM target. */
export function getHistoireControlsOverlay(element: HTMLElement): HTMLElement | undefined {
  const provider = element.closest('.histoire-provider')
  return provider?.querySelector<HTMLElement>(':scope > [data-histoire-overlay]') ?? undefined
}
