import type { HistoireGlobals } from '@histoire/protocol'
import { validateSettingsPatch } from '@histoire/protocol'

/** One isolated story document's globals; no browser/framework access at import. */
const current: HistoireGlobals = {}
const listeners = new Set<(value: HistoireGlobals) => void>()
const subscribers = new Set<(value: HistoireGlobals) => void>()
let read = () => current

/** Runtime-local Svelte/vanilla readable, separate from JSON map keys. */
export interface HistoireGlobalsStore {
  /** Immediately publish current map, then updates, until returned cleanup runs. */
  subscribe: (listener: (value: HistoireGlobals) => void) => () => void
}

/** Framework supplies its own reactive proxy, retaining host peer runtime. */
export function registerHistoireGlobalsAdapter(get: () => HistoireGlobals, update: (value: HistoireGlobals) => void): () => void {
  read = get
  update(current)
  listeners.add(update)
  return () => {
    listeners.delete(update)
    if (read === get) read = () => current
  }
}

/** Story-facing reactive globals provided by current framework adapter. */
export function useHistoireGlobals(): HistoireGlobals {
  return read()
}

/** Svelte templates use `$globals`; vanilla consumers call subscribe and own cleanup. */
export function useHistoireGlobalsStore(): HistoireGlobalsStore {
  return {
    /** Immediate snapshot followed by updates; callback never crosses wire. */
    subscribe(listener) {
      subscribers.add(listener)
      listener(read())
      return () => {
        subscribers.delete(listener)
      }
    },
  }
}

/** Validate whole update before notifying; invalid input cannot partly mutate runtime. */
export function setHistoireGlobals(value: HistoireGlobals): void {
  validateSettingsPatch({ globals: value })
  for (const key of Object.keys(current)) {
    if (!Object.hasOwn(value, key)) delete current[key]
  }
  Object.assign(current, value)
  for (const listener of listeners) listener(current)
  for (const listener of subscribers) listener(read())
}
