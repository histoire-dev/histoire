<script setup lang="ts">
import type { HistoireSearchResult, HistoireTarget } from '@histoire/protocol'
import type { ClientCommand } from '@histoire/shared'
import type { createStandaloneCommands } from '../../../standalone/commands.js'
import type { WorkbenchSearchState } from './controller.js'
import type { SearchScope, WorkbenchSearchResult } from './query.js'
import { getControlElement, HstButton, HstText } from '@histoire/controls/vue'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import CommandPrompts from '../../command/CommandPrompts.vue'
import WorkbenchVirtualList from '../../lists/WorkbenchVirtualList.vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'
import { getSearchCommandDomId, SEARCH_ACTIVE_RESULT_ID, SEARCH_RESULTS_ID } from './accessibility.js'
import { createWorkbenchSearchController } from './controller.js'
import { getSearchActivationResult, getSearchFrameMatches } from './query.js'
import SearchResultGroup from './SearchResultGroup.vue'
import SearchScopes from './SearchScopes.vue'

const props = defineProps<{
  /** Existing standalone plugin actions and prompt context. */
  commands: ReturnType<typeof createStandaloneCommands>
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
const snapshot = shallowRef(context.session.getSnapshot())
useHistoireResource(context.session.subscribe(value => snapshot.value = value))
const input = ref<HTMLInputElement | null>(null)
const query = ref('')
const scope = ref<SearchScope>('all')
const state = shallowRef<WorkbenchSearchState>({ query: '', loading: false, results: [], error: null })
const search = createWorkbenchSearchController(context.session, value => state.value = value)
useHistoireResource(search.close)
let active = true
let activationGeneration = 0
useHistoireResource(() => {
  active = false
})
const selectedCommand = shallowRef<ClientCommand | null>(null)
const commands = computed(() => snapshot.value.source?.mode === 'dev' && query.value.startsWith('>') ? props.commands.list(query.value.slice(1).trim()) : [])
const results = computed(() => state.value.results.filter(result => scope.value === 'all' || (scope.value === 'stories' ? result.kind === 'story' || result.kind === 'variant' : result.kind === (scope.value === 'props' ? 'prop' : 'docs'))))
const groups = computed(() => [
  { title: 'Variants', results: results.value.filter(result => result.kind === 'story' || result.kind === 'variant') },
  { title: 'Props', results: results.value.filter(result => result.kind === 'prop') },
  { title: 'Docs', results: results.value.filter(result => result.kind === 'docs') },
])
const ordered = computed(() => groups.value.flatMap(group => group.results))
const index = ref(0)
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
  emit('query', value)
  search.search(value)
  index.value = 0
  selectedCommand.value = null
}, { flush: 'sync' })
watch([ordered, commands], ([rows, actions], [oldRows, oldActions]) => {
  if (!oldRows.length && !oldActions.length) {
    index.value = 0
    return
  }
  const previous = [...oldRows.map(row => row.id), ...oldActions.map(command => command.id)][index.value]
  // Removing a visible command retires its keyboard intent. Another command
  // cannot acquire Enter merely by occupying the former array position.
  index.value = previous ? [...rows.map(row => row.id), ...actions.map(command => command.id)].indexOf(previous) : -1
}, { flush: 'sync' })

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

/** Prompts retain existing plugin contracts; this component owns no command transport. */
function execute(command: ClientCommand, params: Record<string, any>) {
  void props.commands.execute(command, params).catch((error) => {
    if (active) emit('error', error)
  })
}

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
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') index.value = index.value < 0 ? event.key === 'ArrowDown' ? 0 : count - 1 : (index.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
  else if (ordered.value[index.value]) void activate(ordered.value[index.value], event.metaKey || event.ctrlKey)
  else if (commands.value[index.value - ordered.value.length]) activateCommand(commands.value[index.value - ordered.value.length])
}
</script>

<template>
  <!-- Keep workbench layout independent of the portable SDK search styles. -->
  <section class="workbench-search" aria-label="Search" :aria-busy="state.loading" data-test-id="search-modal" @keydown="keydown">
    <label class="search-input">
      <WorkbenchIcon name="search" />
      <HstText :ref="value => { input = getControlElement(value) as HTMLInputElement }" v-model="query" layout="inline" type="search" aria-label="Search stories, docs and props" :aria-controls="SEARCH_RESULTS_ID" :aria-describedby="activeCursor ? SEARCH_ACTIVE_RESULT_ID : undefined" placeholder="Search…" autocomplete="off" />
      <kbd>esc</kbd>
    </label>
    <SearchScopes v-model="scope" />
    <p v-if="state.error" class="notice" role="status">
      Search index unavailable. Loaded props remain searchable.
    </p>
    <p v-if="query.trim() && !state.loading && !ordered.length && !commands.length" class="empty">
      No matches
    </p>
    <p v-if="activeCursor" :id="SEARCH_ACTIVE_RESULT_ID" class="search-active-result" role="status" aria-live="polite" data-search-active-result>
      {{ activeCursor.label }}
    </p>
    <div :id="SEARCH_RESULTS_ID">
      <SearchResultGroup :groups="groups" :query="query" :active-id="activeId" :selection="snapshot.selection" @activate="activate" @focus="index = ordered.findIndex(result => result.id === $event)" />
      <section v-if="commands.length" class="command-results" aria-label="Commands">
        <h3>Commands</h3>
        <WorkbenchVirtualList ref="commandList" :items="commandRows" :min-item-size="40" page-mode list-tag="ul" item-tag="li">
          <template #default="{ item, index: position }">
            <HstButton :id="getSearchCommandDomId(item.command.id)" color="flat" type="button" data-test-id="search-item" data-search-kind="command" :class="{ active: index === ordered.length + position }" @focus="index = ordered.length + position" @click="activateCommand(item.command)">
              <WorkbenchIcon name="terminal" />{{ item.command.label }}
            </HstButton>
          </template>
        </WorkbenchVirtualList>
      </section>
    </div>
    <CommandPrompts v-if="selectedCommand" :command="selectedCommand" :context="props.commands.context()" :execute="execute" @close="selectedCommand = null" />
  </section>
</template>

<style scoped>
.workbench-search { flex: 1; padding: 14px 10px; overflow: auto; min-width: 0; min-height: 0; background: var(--histoire-surface); color: var(--histoire-text); }
.search-.histoire-text { flex: 1; min-width: 0; }
.search-input:focus-within { outline: 2px solid var(--histoire-accent); outline-offset: -1px; }
.search-input svg { color: var(--histoire-muted); width: 17px; height: 17px; flex: none; }
.search-input .histoire-text { flex: 1; min-width: 0; }
kbd { color: var(--histoire-muted); font: 11px var(--histoire-font-mono, monospace); }
.notice, .empty { margin: 20px 10px; color: var(--histoire-muted); font-size: 12px; }
.search-active-result { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.command-results { margin-top: 22px; }
.command-results h3 { padding: 0 10px; color: var(--histoire-muted); font-size: 12px; }
.command-results button { display: flex; gap: 10px; align-items: center; width: 100%; padding: 10px; color: inherit; text-align: left; }
.command-results button.active { background: var(--histoire-accent-soft); }
.command-results button:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: -2px; }
</style>
