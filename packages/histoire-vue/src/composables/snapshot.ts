import type { HistoireSession } from '@histoire/sdk'
import type { ShallowRef } from 'vue'
import { shallowReadonly, shallowRef } from 'vue'
import { useHistoireContext, useHistoireResource } from '../provider/context.js'

/** Observe coherent SDK snapshots without deep proxying frozen DTOs or leaking listeners. */
export function useHistoireSnapshot(): Readonly<ShallowRef<ReturnType<HistoireSession['getSnapshot']>>> {
  const { session } = useHistoireContext()
  const snapshot = shallowRef(session.getSnapshot())
  useHistoireResource(session.subscribe(value => snapshot.value = value))
  return shallowReadonly(snapshot)
}
