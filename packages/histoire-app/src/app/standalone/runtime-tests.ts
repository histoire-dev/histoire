import type { HistoireTestsModel } from '@histoire/vue/internal'
import type { StandaloneRuntimeBinding } from './runtime-binding.js'
import { createHistoireTestsModel } from '@histoire/vue/internal'
import { shallowRef, watch } from 'vue'
import { createStandaloneTests } from './tests.js'

/** Keep one shared badge/panel model while its finite controller follows selected runtime. */
export function createStandaloneRuntimeTests(runtime: StandaloneRuntimeBinding) {
  let adapter: ReturnType<typeof createStandaloneTests> | undefined
  let closed = false
  let stopState = () => {}
  const state: HistoireTestsModel['state'] = shallowRef({ status: 'idle', collection: null, summary: null, error: null })
  const stopRuntime = watch(runtime.current, (session) => {
    stopState()
    adapter?.close()
    // Root disposal precedes Vue teardown; never acquire a replacement controller
    // from its disposed session while mounted consumers are retiring.
    if (session.getSnapshot().status === 'disposed') return
    const model = createHistoireTestsModel(session)
    adapter = createStandaloneTests(session, model)
    stopState = watch(model.state, value => state.value = value, { immediate: true, flush: 'sync' })
  }, { immediate: true, flush: 'sync' })
  /** Stable controller methods prevent mounted panels from retaining a retired controller. */
  const model: HistoireTestsModel = {
    get session() { return runtime.current.value },
    state,
    controller: {
      collect: () => adapter!.model.controller.collect(),
      run: mode => adapter!.model.controller.run(mode),
      cancel: () => adapter?.model.controller.cancel(),
      close,
    },
  }
  /** Root adapter owns controller cancellation and reactive state observation. */
  function close(): void {
    if (closed) return
    closed = true
    stopRuntime()
    stopState()
    adapter?.close()
  }
  return { model, close }
}
