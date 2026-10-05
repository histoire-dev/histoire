import type { HistoireSession } from '@histoire/sdk'
import type { InjectionKey, ShallowRef } from 'vue'
import type { HistoireTestsState } from './controller.js'
import { inject, provide, shallowRef } from 'vue'
import { createHistoireTestsController } from './controller.js'

/** One shared panel controller/state, optionally owned by first-party standalone. */
export interface HistoireTestsModel {
  /** Exact caller session prevents inheritance through independent nested provider. */
  session: HistoireSession
  /** Collection/run state also supplies standalone tab count. */
  state: ShallowRef<HistoireTestsState>
  /** Existing finite collection/run/cancellation implementation. */
  controller: ReturnType<typeof createHistoireTestsController>
}

/** Local Vue injection remains scoped to exact explicitly provided session. */
const key: InjectionKey<HistoireTestsModel> = Symbol('Histoire standalone tests')

/** Caller explicitly owns model lifecycle; creating model executes no story/tests. */
export function createHistoireTestsModel(session: HistoireSession): HistoireTestsModel {
  const state = shallowRef<HistoireTestsState>({ status: 'idle', collection: null, summary: null, error: null })
  return { session, state, controller: createHistoireTestsController(session, value => state.value = value) }
}

/** First-party standalone shares one controller between badge and independent panel. */
export function provideHistoireTestsModel(model: HistoireTestsModel): void {
  provide(key, model)
}

/** Native public components default to their own explicitly operated controller. */
export function useProvidedHistoireTestsModel(session: HistoireSession): HistoireTestsModel | undefined {
  const model = inject(key, undefined)
  return model?.session === session ? model : undefined
}
