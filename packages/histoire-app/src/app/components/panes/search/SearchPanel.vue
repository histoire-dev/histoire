<script setup lang="ts">
import type { HistoireSearchResult, HistoireTarget } from '@histoire/protocol'
import type { ClientCommand } from '@histoire/shared'
import type { createStandaloneCommands } from '../../../standalone/commands.js'
import type { WorkbenchSearchRuntime, WorkbenchSearchState } from './controller.js'
import type { SearchScope, WorkbenchSearchResult } from './query.js'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useContextMenu } from '../../../composables/context-menu.js'
import CommandPrompts from '../../command/CommandPrompts.vue'
import WorkbenchVirtualList from '../../lists/WorkbenchVirtualList.vue'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import WorkbenchLoadingState from '../../shell/WorkbenchLoadingState.vue'

import { getSearchCommandDomId, SEARCH_ACTIVE_RESULT_ID, SEARCH_RESULTS_ID } from './accessibility.js'
import { createWorkbenchCommandExecutor } from './command-execution.js'
import { createWorkbenchSearchController } from './controller.js'
import { getSearchActivationResult, getSearchFrameMatches } from './query.js'
import SearchResultList from './SearchResultList.vue'
import SearchScopes from './SearchScopes.vue'

const props = defineProps<{
  /** Existing standalone plugin actions and prompt context. */
  commands: ReturnType<typeof createStandaloneCommands>
  /** Selected runtime owner; canvas frames hold prop metadata, not the canonical session. */
  runtime?: WorkbenchSearchRuntime
}>()
const emit = defineEmits<{
  /** Completed canonical activation, retaining original docs anchor. */
  select: [result: HistoireSearchResult]
  /** Open exact result in an isolated preview through host URL adapter. */
  isolated: [target: HistoireTarget]
  /** Matching exact canvas frame keys. */
  highlight: [keys: string[]]
  /** Toolbar-style next matching frame intent. */
  nextMatch: []
  /** Escape returns focus through shell. */
  close: []
  /** Raw query for shell/canvas state. */
  query: [value: string]
  /** Failed activation or command execution. */
  error: [error: unknown]
}>()
const context = useHistoireContext()
const menu = useContextMenu()
const snapshot = shallowRef(context.session.getSnapshot())
useHistoireResource(context.session.subscribe(value => snapshot.value = value))
const input = ref<HTMLInputElement | null>(null)
const query = ref('')
const scope = ref<SearchScope>('all')
const state = shallowRef<WorkbenchSearchState>({ query: '', loading: false, results: [], error: null })
const search = createWorkbenchSearchController(context.session, value => state.value = value, props.runtime)
useHistoireResource(search.close)
let active = true
let activationGeneration = 0
useHistoireResource(() => {
  active = false
})
const selectedCommand = shallowRef<ClientCommand | null>(null)
const commands = computed(() => snapshot.value.source?.mode === 'dev' && query.value.startsWith('>') ? props.commands.list(query.value.slice(1).trim()) : [])
const results = computed(() => state.value.results.filter(result => scope.value === 'all' || (scope.value === 'stories' ? result.kind === 'story' || result.kind === 'variant' : result.kind === (scope.value === 'props' ? 'prop' : 'docs'))))
const ordered = results
const index = ref(0)
/** Default cursor follows ranking until keyboard or native row focus owns a result. */
let hasCursorIntent = false
const activeId = computed(() => ordered.value[index.value]?.id)
const commandRows = computed(() => commands.value.map(command => ({ key: command.id, command })))
/** Screen readers need exact keyboard intent while native focus remains in input. */
const activeCursor = computed(() => {
  const count = ordered.value.length + commands.value.length
  const result = ordered.value[index.value]
  if (result) return { label: `${result.title}, ${result.kind === 'docs' ? 'documentation' : result.kind} result, ${index.value + 1} of ${count}` }
  const command = commands.value[index.value - ordered.value.length]
  return command ? { label: `${command.label}, command, ${index.value + 1} of ${count}` } : undefined
})
const commandList = ref<{ reveal: (key: string) => Promise<void> }>()
const unregisterOpenResult = menu?.register({
  id: 'search.open-result',
  label: 'Open result',
  icon: 'launch',
  group: 'open',
  available: target => target.kind === 'search-result' && Boolean(ordered.value.some(result => result.id === target.key)),
  run: async (target) => {
    if (target.kind !== 'search-result') return
    const result = ordered.value.find(item => item.id === target.key)
    if (result) await activate(result)
  },
})
if (unregisterOpenResult) useHistoireResource(unregisterOpenResult)
watch(() => commands.value[index.value - ordered.value.length]?.id, key => key && void commandList.value?.reveal(key), { flush: 'post' })
const currentStory = computed(() => snapshot.value.catalog.stories.find(story => story.id === snapshot.value.selection?.storyId))
const matches = computed(() => query.value.trim() ? getSearchFrameMatches(results.value, currentStory.value) : [])
watch(matches, value => emit('highlight', value), { immediate: true })
onBeforeUnmount(() => {
  emit('highlight', [])
  emit('query', '')
})
watch(query, (value) => {
  activationGeneration++
  hasCursorIntent = false
  emit('query', value)
  search.search(value)
  index.value = 0
  selectedCommand.value = null
}, { flush: 'sync' })
watch([ordered, commands], ([rows, actions], [oldRows, oldActions]) => {
  // Loaded props can arrive before source results. Until the user navigates,
  // first Enter must follow the strongest current result rather than that prop.
  if (!hasCursorIntent) {
    index.value = 0
    return
  }
  const previous = [...oldRows.map(row => row.id), ...oldActions.map(command => command.id)][index.value]
  // Removing a visible command retires its keyboard intent. Another command
  // cannot acquire Enter merely by occupying the former array position.
  index.value = previous ? [...rows.map(row => row.id), ...actions.map(command => command.id)].indexOf(previous) : -1
}, { flush: 'sync' })

/** Native result focus claims exact identity, never a retired row's old position. */
function focusResult(id: string) {
  const position = ordered.value.findIndex(result => result.id === id)
  if (position < 0) return
  hasCursorIntent = true
  index.value = position
}

/** Command focus uses its live registry ID across reactive availability changes. */
function focusCommand(id: string) {
  const position = commands.value.findIndex(command => command.id === id)
  if (position < 0) return
  hasCursorIntent = true
  index.value = ordered.value.length + position
}

/** Pane openings and explicit search shortcuts share the mounted input focus action. */
async function focus() {
  await nextTick()
  if (active) {
    input.value?.focus()
    input.value?.select()
  }
}
onMounted(focus)
defineExpose({ focus, search: (value: string) => query.value = value })

/** Use canonical selection; detached/stale query rows cannot open a new target. */
async function activate(result: WorkbenchSearchResult, isolated = false) {
  if (!ordered.value.some(row => row.id === result.id)) return
  const generation = ++activationGeneration
  if (isolated) {
    emit('isolated', result.target)
    return
  }
  const source = snapshot.value.source
  const ownedQuery = query.value
  /** Errors can occur before selection succeeds, but still require exact live query/source intent. */
  function ownsFeedback() {
    const current = context.session.getSnapshot()
    return active && generation === activationGeneration && query.value === ownedQuery && !current.stale && current.source?.sourceId === source?.sourceId && current.source?.epoch === source?.epoch && current.source?.revision === source?.revision
  }
  /** Route completion may await; only its exact live target can dismiss. */
  function ownsActivation() {
    const current = context.session.getSnapshot()
    return ownsFeedback() && !!current.selection && getHistoireTargetKey(current.selection) === getHistoireTargetKey(result.target)
  }
  try {
    await context.session.selection.select(result.target)
    if (!ownsActivation()) return
    const value = getSearchActivationResult(result)
    if (!context.panels.showDocs(value, source)) return
    await props.commands.activateSearch(value)
    if (ownsActivation()) emit('select', value)
  }
  catch (error) { if (ownsFeedback()) emit('error', error) }
}

/** Prompt submission retains transport contract and captured feedback ownership. */
const commandExecutor = createWorkbenchCommandExecutor(context.session, () => props.commands, () => activationGeneration, error => emit('error', error))
useHistoireResource(commandExecutor.close)
const execute = commandExecutor.execute

/** Selecting a prompt command only opens its form. */
function activateCommand(command: ClientCommand) {
  if (!commands.value.some(row => row.id === command.id)) return
  if (command.prompts?.length) {
    selectedCommand.value = command
  }
  else {
    try {
      execute(command, command.getParams?.(props.commands.context()) ?? {})
    }
    catch (error) { emit('error', error) }
  }
}

/** Input owns search navigation; Tab advances canvas matches without leaving this pane. */
function keydown(event: KeyboardEvent) {
  if (selectedCommand.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    query.value = ''
    emit('close')
    return
  }
  if (event.key === 'Tab' && matches.value.length && !event.shiftKey) {
    event.preventDefault()
    emit('nextMatch')
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return
  // Native row Enter carries its own exact owner; only input Enter uses index.
  if (event.key === 'Enter' && event.target !== input.value) return
  event.preventDefault()
  const count = ordered.value.length + commands.value.length
  if (!count) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    hasCursorIntent = true
    index.value = index.value < 0 ? event.key === 'ArrowDown' ? 0 : count - 1 : (index.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
  }
  else if (ordered.value[index.value]) {
    void activate(ordered.value[index.value], event.metaKey || event.ctrlKey)
  }
  else if (commands.value[index.value - ordered.value.length]) {
    activateCommand(commands.value[index.value - ordered.value.length])
  }
}
</script>

<template>
  <!-- Keep workbench layout independent of the portable SDK search styles. -->
  <section class="workbench-search" aria-label="Search" :aria-busy="state.loading" data-test-id="search-modal" @keydown="keydown">
    <label class="search-input">
      <BuiltinIcon icon="search" aria-hidden="true" :size="16" />
      <input
        ref="input"
        v-model="query"
        class="search-query"
        type="search"
        aria-label="Search stories, docs and props"
        :aria-controls="SEARCH_RESULTS_ID"
        :aria-describedby="activeCursor ? SEARCH_ACTIVE_RESULT_ID : undefined"
        placeholder="Search…"
        autocomplete="off"
      >
      <kbd aria-hidden="true">esc</kbd>
    </label>
    <SearchScopes v-model="scope" />
    <p v-if="state.error" class="notice" role="status">
      Search index unavailable. Loaded props remain searchable.
    </p>
    <WorkbenchLoadingState v-if="query.trim() && state.loading && !ordered.length && !commands.length" title="Searching…" />
    <WorkbenchEmptyState v-if="query.trim() && !state.loading && !ordered.length && !commands.length" icon="search" title="No matches">
      Nothing for <q class="search-empty-query">{{ query.trim() }}</q><template v-if="scope !== 'all'">
        in {{ scope }}
      </template>
      <template v-if="scope !== 'all'" #actions>
        <HstButton color="flat" @click="scope = 'all'">
          Search everything
        </HstButton>
      </template>
    </WorkbenchEmptyState>
    <p v-if="activeCursor" :id="SEARCH_ACTIVE_RESULT_ID" class="search-active-result" role="status" aria-live="polite" data-search-active-result>
      {{ activeCursor.label }}
    </p>
    <div :id="SEARCH_RESULTS_ID" class="search-results">
      <SearchResultList :results="ordered" :query="query" :active-id="activeId" :selection="snapshot.selection" @activate="activate" @focus="focusResult" />
      <section v-if="commands.length" class="command-results" aria-label="Commands">
        <h3>Commands</h3>
        <WorkbenchVirtualList ref="commandList" :items="commandRows" :min-item-size="40" page-mode list-tag="ul" item-tag="li">
          <template #default="{ item, index: position }">
            <HstButton :id="getSearchCommandDomId(item.command.id)" color="flat" type="button" data-test-id="search-item" data-search-kind="command" :class="{ active: index === ordered.length + position }" @focus="focusCommand(item.command.id)" @click="activateCommand(item.command)">
              <BuiltinIcon icon="terminal" :size="16" />{{ item.command.label }}
            </HstButton>
          </template>
        </WorkbenchVirtualList>
      </section>
    </div>
    <CommandPrompts v-if="selectedCommand" :command="selectedCommand" :context="props.commands.context()" :execute="execute" @close="selectedCommand = null" />
  </section>
</template>

<style scoped>
.workbench-search { flex: 1; padding: 16px var(--histoire-pane-gutter); overflow: auto; min-width: 0; min-height: 0; background: var(--histoire-surface); color: var(--histoire-text); }
.search-input { display: flex; align-items: center; gap: 12px; box-sizing: border-box; width: 100%; min-width: 0; height: 40px; padding: 0 12px; margin: 0 0 8px; border: 1px solid var(--histoire-border); border-radius: 12px; background: var(--histoire-input); color: var(--histoire-text); }
.search-input:focus-within { border-color: var(--histoire-accent); box-shadow: 0 0 0 1px var(--histoire-accent); }
.search-input svg { color: var(--histoire-muted); width: 18px; height: 18px; flex: none; }
.search-query { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; appearance: none; -webkit-appearance: none; }
.search-query::placeholder { color: var(--histoire-muted); opacity: 1; }
.search-query::-webkit-search-cancel-button { display: none; -webkit-appearance: none; }
kbd { flex: none; color: var(--histoire-muted); font: 11px var(--histoire-font-mono, monospace); }
.notice { margin: 20px 0; color: var(--histoire-muted); font-size: 12px; }
.search-empty-query { color: var(--histoire-text); }
.search-active-result { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.workbench-search :deep(.workbench-state) { margin-inline: 0; }
.command-results { margin-top: 22px; }
.command-results h3 { padding: 0 8px; color: var(--histoire-muted); font-size: 12px; }
.command-results button { display: flex; gap: 10px; align-items: center; width: 100%; padding: 10px 8px; color: inherit; text-align: left; }
.command-results button.active { background: var(--histoire-accent-soft); }
.command-results button:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: -2px; }
</style>
