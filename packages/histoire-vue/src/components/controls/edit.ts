import type { HistoireSession } from '@histoire/sdk'
import type { ShallowRef } from 'vue'
import { computed, shallowRef, watch } from 'vue'
import { useHistoireContext, useHistoireResource } from '../../provider/context.js'

/** Native editors share ordered patches so sibling automatic props retain each other's edits. */
const queues = new WeakMap<HistoireSession, Promise<unknown>>()

/** JSON editor initialization and incoming projections are not fresh user mutations. */
function sameValue(value: unknown, current: unknown): boolean {
  if (Object.is(value, current)) return true
  if (!value || !current || typeof value !== 'object' || typeof current !== 'object') return false
  try {
    return JSON.stringify(value) === JSON.stringify(current)
  }
  catch { return false }
}

/** Each editor retains newest local intent while source acknowledgments publish earlier values. */
export function useHistoireControlEdit(snapshot: Readonly<ShallowRef<ReturnType<HistoireSession['getSnapshot']>>>, read: () => unknown) {
  const context = useHistoireContext()
  const draft = shallowRef<{ value: unknown } | null>(null)
  let active = true
  let pending = false
  let queued: { owner: string, write: () => Promise<unknown> } | null = null

  /** Target and source changes revoke queued edits even if field name is reused. */
  function owner(): string {
    const value = snapshot.value
    return JSON.stringify([value.source, value.selection, value.runtime.runtimeId])
  }

  /** Join sibling edits, recomputing patches from latest accepted mirror at admission. */
  async function flush(): Promise<void> {
    if (pending) return
    pending = true
    try {
      while (queued) {
        if (!active) break
        const edit = queued
        queued = null
        const operation = (queues.get(context.session) ?? Promise.resolve()).catch(() => {}).then(() => {
          if (active && edit.owner === owner()) return edit.write()
        })
        queues.set(context.session, operation)
        try {
          await operation
        }
        catch (error) {
          if (active && edit.owner === owner()) context.reportError(error)
        }
        if (active && edit.owner === owner() && !queued) draft.value = null
      }
    }
    finally { pending = false }
  }

  watch(owner, () => {
    queued = null
    draft.value = null
  }, { flush: 'sync' })
  useHistoireResource(() => {
    active = false
    queued = null
    draft.value = null
  })
  return {
    /** Runtime projection resumes only after latest local edit is acknowledged. */
    value: computed(() => draft.value ? draft.value.value : read()),
    /** Coalesce intermediate keystrokes without losing final user intent. */
    set(value: unknown, write: () => Promise<unknown>, force = false): void {
      if (!active || (!force && sameValue(value, draft.value ? draft.value.value : read()))) return
      draft.value = { value }
      queued = { owner: owner(), write }
      void flush()
    },
  }
}
