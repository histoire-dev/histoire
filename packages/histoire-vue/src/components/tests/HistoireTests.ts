import type { HistoireTestCollectionResult, HistoireTestError, HistoireTestRunSummary } from '@histoire/protocol'
import type { PropType } from 'vue'
import type { HistoireVirtualSlot } from '../../foundation/VirtualList.js'
import { HstButton } from '@histoire/controls/vue'
import { defineComponent, h, watch } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { HistoireVirtualList } from '../../foundation/VirtualList.js'
import { useHistoireContext, useHistoireResource } from '../../provider/context.js'
import { createHistoireTestsModel, useProvidedHistoireTestsModel } from '../../tests/model.js'

/** Independent native tests panel; mounting executes no story or test module. */
export const HistoireTests = defineComponent({
  name: 'HistoireTests',
  props: {
    /** Host may display an attributable cached result without replaying its run. */
    summary: { type: Object as PropType<HistoireTestRunSummary>, default: undefined },
    /** Host may display collected definitions without replaying collection in preview. */
    collection: { type: Object as PropType<HistoireTestCollectionResult>, default: undefined },
    /** Exact externally owned target execution blocks duplicate local actions. */
    running: { type: Boolean, default: false },
  },
  emits: ['completed', 'error'],
  setup(props, { emit, expose }) {
    const { session } = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const provided = useProvidedHistoireTestsModel(session)
    const { state, controller } = provided ?? createHistoireTestsModel(session)
    if (!provided) useHistoireResource(controller.close)
    expose(controller)
    let operated = false
    let cachedSummaryAtRun = props.summary
    let cachedCollectionAtRun = props.collection
    // A static host cache may predate explicit local execution. Only a changed
    // host publication supersedes that local result or retires its failure.
    watch(() => state.value.status, (status) => {
      if (status !== 'running' && status !== 'collecting') {
        if (status === 'idle' && !state.value.collection && !state.value.summary) operated = false
        return
      }
      operated = true
      cachedSummaryAtRun = props.summary
      cachedCollectionAtRun = props.collection
    }, { flush: 'sync' })
    /** UI always observes errors; failed assertions still emit completed summary. */
    function perform(mode?: 'preview' | 'server') {
      void (mode ? controller.run(mode) : controller.collect()).then((result) => {
        if (mode && state.value.summary === result) emit('completed', result)
      }).catch((error) => {
        if (state.value.error === error) emit('error', error)
      })
    }
    /** Serialized assertion details remain text; source excerpts in stacks are never executed. */
    function failure(error: HistoireTestError, index: number) {
      const message = typeof error === 'string' ? error : error.message
      return h('details', { key: index, class: 'histoire-test-error' }, [
        h('summary', message),
        typeof error === 'string'
          ? null
          : [
              error.diff ? h('pre', { 'aria-label': 'Assertion difference' }, error.diff) : null,
              error.stack ? h('pre', { 'aria-label': 'Error stack and source excerpt' }, error.stack) : null,
            ],
      ])
    }
    return () => {
      const localBusy = ['running', 'collecting'].includes(state.value.status)
      const busy = props.running || localBusy
      const preview = snapshot.value.runtime.status === 'ready' && snapshot.value.capabilities.previewTests.available
      const server = snapshot.value.source?.mode === 'dev' && snapshot.value.capabilities.serverTests.available && !!snapshot.value.selection?.variantId
      const summary = localBusy || (operated && state.value.status === 'completed' && props.summary === cachedSummaryAtRun) ? state.value.summary : props.summary ?? state.value.summary
      const collection = operated && state.value.collection && props.collection === cachedCollectionAtRun ? state.value.collection : props.collection ?? state.value.collection
      const definitions = collection?.definitions ?? []
      const rows = (summary?.tests ?? definitions).map(test => ({ key: test.id, test }))
      // A fresh host-owned result supersedes a retired local operation's failure.
      const cacheChanged = (props.summary && props.summary !== cachedSummaryAtRun) || (props.collection && props.collection !== cachedCollectionAtRun)
      const error = !localBusy && (cacheChanged || (!operated && (props.summary || props.collection))) ? null : state.value.error
      return h('section', { 'class': 'histoire-tests', 'aria-label': 'Histoire tests' }, [
        h('div', { class: 'histoire-tests-actions' }, [
          h(HstButton, { color: 'flat', type: 'button', disabled: busy || !preview, onClick: () => perform() }, { default: () => 'Collect' }),
          h(HstButton, { color: 'flat', type: 'button', disabled: busy || !preview, onClick: () => perform('preview') }, { default: () => 'Run preview' }),
          h(HstButton, { color: 'flat', type: 'button', disabled: busy || !server, onClick: () => perform('server') }, { default: () => 'Run server' }),
          localBusy ? h(HstButton, { color: 'flat', type: 'button', onClick: controller.cancel }, { default: () => 'Cancel' }) : null,
        ]),
        h('output', { 'aria-live': 'polite' }, busy ? 'running' : summary ? `${summary.passed} passed · ${summary.failed} failed · ${summary.skipped} skipped` : collection ? `${definitions.length} collected` : state.value.status),
        error ? h('p', { role: 'alert' }, (error as Error).message ?? String(error)) : null,
        h(HistoireVirtualList, { items: rows, minItemSize: 40, listTag: 'ul', itemTag: 'li' }, { default: ({ index }: HistoireVirtualSlot) => {
          const test = rows[index].test
          return h('div', { class: 'histoire-test-row' }, [test.fullName, 'state' in test ? ` — ${test.state}` : test.mode === 'skip' || test.mode === 'todo' ? ' — Skipped' : ' — Not run', 'errors' in test ? test.errors.map(failure) : null])
        } }),
      ])
    }
  },
})
