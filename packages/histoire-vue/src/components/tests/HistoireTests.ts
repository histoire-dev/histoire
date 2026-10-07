import type { HistoireTestCollectionResult, HistoireTestError, HistoireTestRunSummary } from '@histoire/protocol'
import type { PropType } from 'vue'
import type { HistoireVirtualSlot } from '../../foundation/VirtualList.js'
import { getControlElement, HstButton, restoreControlsFocus } from '@histoire/controls/vue'
import { defineComponent, h, nextTick, shallowRef, watch } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { HistoireDropdown } from '../../foundation/floating.js'
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
    const actionTrigger = shallowRef<HTMLButtonElement | null>(null)
    const actionMenu = shallowRef<HTMLElement | null>(null)
    const actionsOpen = shallowRef(false)
    let active = true
    let focusVersion = 0
    let actionsOpenLast = false
    useHistoireResource(() => {
      active = false
      focusVersion++
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
    /** Focuses menu's requested edge only after provider-local dropdown mounts. */
    async function focusActions(last = actionsOpenLast): Promise<void> {
      const version = ++focusVersion
      await nextTick()
      if (!active || !actionsOpen.value || version !== focusVersion) return
      const actions = Array.from(actionMenu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
      actions[last ? actions.length - 1 : 0]?.focus()
    }
    /** Closes menu; explicit keyboard dismissal returns focus to its trigger. */
    function closeActions(restore = false): void {
      const wasOpen = actionsOpen.value
      actionsOpen.value = false
      focusVersion++
      if (restore && wasOpen && actionTrigger.value?.isConnected) actionTrigger.value.focus()
    }
    /** Opens action menu and chooses first or last available command for arrow keys. */
    function openActions(last = false): void {
      actionsOpenLast = last
      actionsOpen.value = true
      void focusActions(last)
    }
    /** Starts selected command after dismissing menu that contained it. */
    function selectAction(mode?: 'preview' | 'server'): void {
      closeActions()
      perform(mode)
    }
    /** Implements expected menu traversal without leaking keys to host shortcuts. */
    function onMenuKeydown(event: KeyboardEvent): void {
      if (event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        closeActions()
        restoreControlsFocus(actionTrigger.value, { restoreFocus: true, focusDirection: event.shiftKey ? 'previous' : 'next' })
        return
      }
      const actions = Array.from(actionMenu.value?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
      const index = actions.indexOf(actionMenu.value?.ownerDocument.activeElement as HTMLButtonElement)
      const next = event.key === 'ArrowDown'
        ? (index + 1) % actions.length
        : event.key === 'ArrowUp'
          ? (index - 1 + actions.length) % actions.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1 : undefined
      if (next === undefined || !actions.length) return
      event.preventDefault()
      event.stopPropagation()
      actions[next]?.focus()
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
          h('div', { 'class': 'histoire-tests-run-group', 'role': 'group', 'aria-label': 'Test actions' }, [
            h(HstButton, { 'color': 'flat', 'type': 'button', 'aria-label': 'Run tests', 'disabled': busy || !preview, 'onClick': () => perform('preview') }, { default: () => [h('span', { 'aria-hidden': true }, '|>'), ' Run'] }),
            h(HistoireDropdown, {
              class: 'histoire-tests-run-dropdown',
              placement: 'bottom-end',
              distance: 6,
              triggers: [],
              shown: actionsOpen.value,
              noAutoFocus: true,
              autoBoundaryMaxSize: true,
              onApplyShow: () => { void focusActions() },
              onHide: () => closeActions(),
            }, {
              default: () => h(HstButton, {
                'color': 'flat',
                'ref': (value: unknown) => { actionTrigger.value = getControlElement(value) as HTMLButtonElement | null },
                'type': 'button',
                'class': 'histoire-tests-run-trigger',
                'aria-label': 'More test actions',
                'aria-haspopup': 'menu',
                'aria-expanded': actionsOpen.value,
                'disabled': busy,
                'onClick': () => actionsOpen.value ? closeActions(true) : openActions(),
                'onKeydown': (event: KeyboardEvent) => {
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
                  event.preventDefault()
                  event.stopPropagation()
                  openActions(event.key === 'ArrowUp')
                },
              }, { default: () => h('span', { 'aria-hidden': true }, '▾') }),
              popper: () => h('div', { 'ref': actionMenu, 'class': 'histoire-tests-run-menu histoire-control-popover', 'role': 'menu', 'aria-label': 'Test actions', 'onKeydown': onMenuKeydown }, [
                h(HstButton, { color: 'flat', type: 'button', role: 'menuitem', tabindex: -1, disabled: busy || !server, onClick: () => selectAction('server') }, { default: () => 'Run on server' }),
                h(HstButton, { color: 'flat', type: 'button', role: 'menuitem', tabindex: -1, disabled: busy || !preview, onClick: () => selectAction() }, { default: () => 'Force refresh' }),
              ]),
            }),
          ]),
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
