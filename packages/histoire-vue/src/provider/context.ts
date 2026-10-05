import type { HistoireSession } from '@histoire/sdk'
import type { InjectionKey, Ref, ShallowRef } from 'vue'
import type { createHistoirePanelNavigation } from './panels.js'
import { inject, onScopeDispose } from 'vue'

/** Provider container dimensions; responsive panels use these instead of window size. */
export interface HistoireContainerSize {
  /** Available content width in CSS pixels. */
  width: number
  /** Available content height in CSS pixels. */
  height: number
}

/** Shared local ownership for native parts; internal entry is first-party only. */
export interface HistoireVueContext {
  /** Explicit caller-owned controller; provider never disposes it. */
  session: HistoireSession
  /** Native root, absent until client mount. */
  root: ShallowRef<HTMLElement | null>
  /** Local teleport target shared by controls and panels. */
  overlay: ShallowRef<HTMLElement | null>
  /** Observed provider content box. */
  size: Readonly<Ref<Readonly<HistoireContainerSize>>>
  /** Source/selection-owned local panel activation; independent parts require no router. */
  panels: ReturnType<typeof createHistoirePanelNavigation>
  /** Own idempotent teardown; returned disposer observes asynchronous rejection. */
  own: (cleanup: () => void | Promise<void>) => () => void
  /** Report typed child failures through provider's error event. */
  reportError: (error: unknown) => void
}

/** Each Vue tree owns its context; no active provider or controller globals. */
export const histoireContextKey: InjectionKey<HistoireVueContext> = Symbol('HistoireProvider')

/** Resolve current provider with clear setup failure for independent parts. */
export function useHistoireContext(): HistoireVueContext {
  const context = inject(histoireContextKey)
  if (!context) throw new Error('HistoireProvider is required')
  return context
}

/** Bind resource to both child scope and provider teardown, cleaning exactly once. */
export function useHistoireResource(cleanup: () => void | Promise<void>): () => void {
  const dispose = useHistoireContext().own(cleanup)
  onScopeDispose(dispose)
  return dispose
}
