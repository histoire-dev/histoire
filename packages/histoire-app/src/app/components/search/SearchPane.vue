<script lang="ts" setup>
import type { ClientCommand } from '@histoire/shared'
import type { SearchResult } from '../../types'
import type { SearchData } from './types'
import { getControlElement, HstText } from '@histoire/controls/vue'
import { Icon } from '@iconify/vue'
import { useDebounce, useFocus } from '@vueuse/core'
import Fuse from 'fuse.js'
import { registeredCommands } from 'virtual:$histoire-commands'
import { computed, ref, shallowRef, watch } from 'vue'
import { useCommandStore } from '../../stores/command.js'
import { useStoryStore } from '../../stores/story'
import { builtinCommands, getCommandContext } from '../../util/commands.js'
import { useSelection } from '../../util/select.js'
import BaseEmpty from '../base/BaseEmpty.vue'
import { storyResultFactory, variantResultFactory } from './result-factories'
import { onUpdate, searchData } from './search-title-data'
import SearchItem from './SearchItem.vue'

const DocSearchData = () => import('./search-docs-data')

const props = defineProps({
  shown: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits({
  close: () => true,
})

function close() {
  emit('close')
}

// Autofocus

const input = ref<HTMLInputElement>()
const { focused } = useFocus(input, {
  initialValue: true,
})

watch(() => props.shown, (value) => {
  if (value) {
    requestAnimationFrame(() => {
      focused.value = true
      input.value.select()
    })
  }
})

// Index

const searchInputText = ref('')
const rateLimitedSearch = useDebounce(searchInputText, 50)

const storyStore = useStoryStore()

let titleSearchIndex: Fuse<{ id: number, text: string }>
let titleIdMap: SearchData['idMap']

function createIndex() {
  return new Fuse<{ id: number, text: string }>([], {
    keys: ['text'],
  })
}

async function loadSearchIndex(data: SearchData) {
  titleSearchIndex = createIndex()

  for (const document of data.index) {
    titleSearchIndex.add(document)
  }

  titleIdMap = data.idMap
}

loadSearchIndex(searchData)
// Handle HMR
onUpdate((searchData) => {
  loadSearchIndex(searchData)
})

let docSearchIndex: Fuse<{ id: number, text: string }>
let docIdMap: SearchData['idMap']

async function loadDocSearchIndex() {
  async function load(data: SearchData) {
    docSearchIndex = createIndex()

    for (const document of data.index) {
      docSearchIndex.add(document)
    }

    docIdMap = data.idMap

    if (rateLimitedSearch.value) {
      await searchOnDocField(rateLimitedSearch.value)
    }
  }

  const searchDataModule = await DocSearchData()

  await load(searchDataModule.searchData)
  // Handle HMR
  searchDataModule.onUpdate((searchData) => {
    load(searchData)
  })
}

loadDocSearchIndex()

// Search

// Result lists are replaced as a whole. Avoid deep-unwrapping vue-router's
// discriminated route objects: their optional `never` fields must stay intact.
const titleResults = shallowRef<SearchResult[]>([])

watch(rateLimitedSearch, async (value) => {
  const list: SearchResult[] = []
  const result = titleSearchIndex.search(value)
  let rank = 0

  for (const document of result) {
    const idMapData = titleIdMap[document.item.id]
    if (!idMapData) continue
    switch (idMapData.kind) {
      case 'story': {
        list.push(storyResultFactory(storyStore.getStoryById(idMapData.id), rank))
        rank++
        break
      }
      case 'variant': {
        const [storyId] = idMapData.id.split(':')
        const story = storyStore.getStoryById(storyId)
        const variant = storyStore.getVariantById(idMapData.id)
        list.push(variantResultFactory(story, variant, rank))
        rank++
        break
      }
    }
  }

  titleResults.value = list
})

const docsResults = shallowRef<SearchResult[]>([])

async function searchOnDocField(query: string) {
  if (docSearchIndex) {
    const list: SearchResult[] = []
    const result = docSearchIndex.search(query)
    let rank = 0

    for (const document of result) {
      const idMapData = docIdMap[document.item.id]
      if (!idMapData) continue
      switch (idMapData.kind) {
        case 'story': {
          list.push(storyResultFactory(storyStore.getStoryById(idMapData.id), rank, 'docs'))
          rank++
          break
        }
      }
    }

    docsResults.value = list
  }
}

watch(rateLimitedSearch, searchOnDocField)

// Commands

const allCommands = [
  ...builtinCommands,
  ...registeredCommands,
]

const commandResults = computed(() => {
  if (__HISTOIRE_DEV__) {
    const commandCtx = getCommandContext()
    const searchText = searchInputText.value.toLowerCase()
    return allCommands
      .filter(command => !command.showIf || command.showIf(commandCtx))
      .filter(command => command.label.toLowerCase().includes(searchText) || command.searchText?.toLowerCase().includes(searchText))
      .map(command => commandResultFactory(command, 0))
  }
  return []
})

const commandStore = useCommandStore()

function commandResultFactory(command: ClientCommand, rank: number): SearchResult {
  return {
    kind: 'command',
    rank,
    id: `_command:${command.id}`,
    title: command.label,
    icon: command.icon ?? 'carbon:chevron-right',
    onActivate: () => {
      commandStore.activateCommand(command)
    },
  }
}

// Results

const results = computed(() => {
  const list = [
    ...commandResults.value,
    ...titleResults.value,
  ]
  const seen = {}
  for (const r of titleResults.value) {
    seen[r.id] = true
  }
  for (const r of docsResults.value) {
    if (!seen[r.id]) {
      list.push(r)
    }
  }
  return list
})

// Selection

const {
  selectedIndex,
  selectNext,
  selectPrevious,
} = useSelection(results)
</script>

<template>
  <div
    class="histoire-search-pane htw-flex htw-items-center htw-gap-4 htw-pl-6 htw-border htw-border-transparent focus-visible:htw-border-primary-500"
    @click="focused = true"
  >
    <Icon
      icon="carbon:search"
      class="flex-none htw-w-4 htw-h-4"
    />

    <HstText
      :ref="value => { input = getControlElement(value) as HTMLInputElement }"
      v-model="searchInputText"
      layout="inline"
      placeholder="Search for stories, variants..."
      class="htw-w-full htw-flex-1 htw-pl-0 htw-pr-6"
      @keydown.down.prevent="selectNext()"
      @keydown.up.prevent="selectPrevious()"
      @keydown.escape="close()"
    />
  </div>

  <BaseEmpty
    v-if="rateLimitedSearch && !results.length"
    class="no-animation"
  >
    No results
  </BaseEmpty>

  <div
    v-else-if="results.length"
    class="htw-max-h-[400px] htw-overflow-y-auto htw-rounded-b-lg"
  >
    <SearchItem
      v-for="(result, index) of results"
      :key="result.id"
      :result="result"
      :selected="index === selectedIndex"
      @close="close()"
    />
  </div>
</template>
