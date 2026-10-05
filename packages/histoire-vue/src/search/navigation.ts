import type { InjectionKey } from 'vue'
import { inject, provide, shallowRef } from 'vue'

/** Extension identity survives visibility changes; callbacks belong to one publication. */
export interface HistoireSearchExtension {
  /** Stable command identity, independent of its current list position. */
  id: string
  /** Activate only the action paired with this visible command. */
  activate: () => void
}

/** First-party search extensions share one keyboard index with story results. */
export interface HistoireSearchNavigation {
  /** Replace current story actions; loading and query changes retire old targets. */
  setResults: (actions: readonly (() => void)[]) => void
  /** Replace visible commands, retaining highlight by ID or retiring removed action. */
  setExtensions: (actions: readonly HistoireSearchExtension[]) => void
  /** Move highlight to explicitly focused story/extension result. */
  focus: (index: number, extension?: boolean) => void
  /** Whether this result owns the combined highlight. */
  isActive: (index: number, extension?: boolean) => boolean
  /** Handle each bubbled key once, including native button Enter activation. */
  keydown: (event: KeyboardEvent) => void
}

/** Scoped injection keeps neighboring providers and independent searches separate. */
const navigationKey: InjectionKey<HistoireSearchNavigation> = Symbol('histoire-search-navigation')

/** Story results precede extension actions; one owner activates exactly one item. */
export function createHistoireSearchNavigation(): HistoireSearchNavigation {
  const results = shallowRef<readonly (() => void)[]>([])
  const extensions = shallowRef<readonly HistoireSearchExtension[]>([])
  const active = shallowRef(0)
  return {
    setResults(actions) {
      results.value = actions
      active.value = 0
    },
    setExtensions(actions) {
      const highlighted = extensions.value[active.value - results.value.length]
      extensions.value = actions
      if (highlighted) {
        const index = actions.findIndex(action => action.id === highlighted.id)
        // Removal retires keyboard intent instead of selecting a different action
        // at the old position. The next arrow explicitly chooses a visible row.
        active.value = index < 0 ? -1 : results.value.length + index
      }
      else if (active.value >= results.value.length + actions.length) {
        active.value = -1
      }
    },
    focus(index, extension = false) {
      active.value = index + (extension ? results.value.length : 0)
    },
    isActive(index, extension = false) {
      return active.value === index + (extension ? results.value.length : 0)
    },
    keydown(event) {
      if (event.defaultPrevented || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return
      const actions = [...results.value, ...extensions.value.map(action => action.activate)]
      if (!actions.length) {
        // Search Enter never implicitly submits an enclosing caller form,
        // including while results are empty or still loading.
        if (event.key === 'Enter') event.preventDefault()
        return
      }
      event.preventDefault()
      if (event.key === 'Enter') actions[active.value]?.()
      else if (active.value < 0) active.value = event.key === 'ArrowDown' ? 0 : actions.length - 1
      else active.value = (active.value + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length
    },
  }
}

/** Only first-party command palette provides an extended navigation owner. */
export function provideHistoireSearchNavigation(navigation: HistoireSearchNavigation): void {
  provide(navigationKey, navigation)
}

/** Independent panels create local navigation, with no global active search. */
export function useHistoireSearchNavigation(): HistoireSearchNavigation {
  return inject(navigationKey, undefined) ?? createHistoireSearchNavigation()
}
