import type { HistoireTestCollectionResult, HistoireTestRunSummary } from '@histoire/protocol'
import type { PropType, SlotsType, VNodeChild } from 'vue'
import type { HistoireVirtualSlot } from '../../foundation/VirtualList.js'
import type { HistoireTestsState } from '../../tests/controller.js'
import { defineComponent, h, watch } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { HistoireVirtualList } from '../../foundation/VirtualList.js'
import { useHistoireContext, useHistoireResource } from '../../provider/context.js'
import { createHistoireTestsModel, useProvidedHistoireTestsModel } from '../../tests/model.js'
import { projectTestRows, renderTestCounts, renderTestProgress, renderTestRow } from './render.js'
import { HistoireTestsRunActions } from './TestsRunActions.js'

/** Status line shown when neither results nor definitions exist. */
const STATUS_LABELS: Record<HistoireTestsState['status'], string> = {
  idle: 'Not run',
  collecting: 'Collecting…',
  running: 'Running…',
  cancelled: 'Cancelled',
  completed: 'Not run',
  failed: 'Failed',
}

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
  slots: Object as SlotsType<{
    /** Replaces default empty message; `collected` tells whether definitions were discovered. */
    empty?: (props: { collected: boolean }) => VNodeChild
    /** Shown while collecting or running before any test is known; status line covers it by default. */
    loading?: (props: { collecting: boolean }) => VNodeChild
  }>,
  setup(props, { emit, expose, slots }) {
    const { session } = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const provided = useProvidedHistoireTestsModel(session)
    const { state, controller } = provided ?? createHistoireTestsModel(session)
    useHistoireResource(() => {
      if (!provided) controller.close()
    })
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
    return () => {
      const localBusy = ['running', 'collecting'].includes(state.value.status)
      const busy = props.running || localBusy
      const preview = snapshot.value.runtime.status === 'ready' && snapshot.value.capabilities.previewTests.available
      const server = snapshot.value.source?.mode === 'dev' && snapshot.value.capabilities.serverTests.available && !!snapshot.value.selection?.variantId
      const summary = localBusy || (operated && state.value.status === 'completed' && props.summary === cachedSummaryAtRun) ? state.value.summary : props.summary ?? state.value.summary
      const collection = operated && state.value.collection && props.collection === cachedCollectionAtRun ? state.value.collection : props.collection ?? state.value.collection
      const definitions = collection?.definitions ?? []
      const rows = projectTestRows(summary, definitions, busy)
      // A fresh host-owned result supersedes a retired local operation's failure.
      const cacheChanged = (props.summary && props.summary !== cachedSummaryAtRun) || (props.collection && props.collection !== cachedCollectionAtRun)
      const error = !localBusy && (cacheChanged || (!operated && (props.summary || props.collection))) ? null : state.value.error
      const status = busy
        ? (state.value.status === 'collecting' ? 'Collecting…' : 'Running…')
        : summary
          ? renderTestCounts(summary)
          : collection ? `${definitions.length} ${definitions.length === 1 ? 'test' : 'tests'}` : STATUS_LABELS[state.value.status]
      return h('section', { 'class': 'histoire-tests', 'aria-label': 'Histoire tests', 'aria-busy': busy || undefined }, [
        h('header', { class: 'histoire-tests-header' }, [
          h(HistoireTestsRunActions, {
            busy,
            cancellable: localBusy,
            canvasAvailable: preview,
            serverAvailable: server,
            onPerform: perform,
            onCancel: controller.cancel,
          }),
          h('output', { 'class': 'histoire-tests-status', 'aria-live': 'polite' }, status),
        ]),
        renderTestProgress(summary, busy),
        error ? h('p', { class: 'histoire-tests-alert', role: 'alert' }, (error as Error).message ?? String(error)) : null,
        rows.length
          ? h(HistoireVirtualList, { class: 'histoire-tests-list', items: rows, minItemSize: 36, listTag: 'ul', itemTag: 'li' }, {
              default: ({ index }: HistoireVirtualSlot) => renderTestRow(rows[index]),
            })
          : busy ? slots.loading?.({ collecting: state.value.status === 'collecting' }) : slots.empty?.({ collected: !!collection }) ?? h('p', { class: 'histoire-tests-empty' }, collection ? 'No tests' : 'Tests not collected'),
      ])
    }
  },
})
