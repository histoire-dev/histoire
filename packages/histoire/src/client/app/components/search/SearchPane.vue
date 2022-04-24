<script lang="ts" setup>
import { useFocus, useDebounce } from '@vueuse/core'
import { ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import flexsearch from 'flexsearch'
import charset from 'flexsearch/dist/module/lang/latin/advanced.js'
import language from 'flexsearch/dist/module/lang/en.js'
import { useStoryStore } from '../../stores/story'
import BaseEmpty from '../base/BaseEmpty.vue'
import type { SearchResult, Story, Variant } from '../../types'
import SearchItem from './SearchItem.vue'
import { searchData, onUpdate } from './search-data.js'

const props = defineProps({
  shown: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits({
  close: () => true,
})

function close () {
  emit('close')
}

// Autofocus

const input = ref<HTMLInputElement>()
const { focused } = useFocus(input, {
  initialValue: true,
})

watch(() => props.shown, value => {
  if (value) {
    requestAnimationFrame(() => {
      focused.value = true
      input.value.select()
    })
  }
})

// Search

const searchInputText = ref('')
const rateLimitedSearch = useDebounce(searchInputText, 50)

const storyStore = useStoryStore()

let searchIndex: flexsearch.Document<any, any>

async function loadSearchIndex (data) {
  searchIndex = new flexsearch.Document({
    preset: 'match',
    document: {
      id: 'id',
      index: [
        'title',
        'docs',
      ],
    },
    worker: true,
    charset,
    language,
    tokenize: 'full',
  })

  for (const key of Object.keys(data)) {
    await searchIndex.import(key, data[key])
  }
}

loadSearchIndex(searchData)
// Handle HMR
onUpdate(searchData => {
  loadSearchIndex(searchData)
})

const results = ref<SearchResult[]>([])

watch(rateLimitedSearch, async value => {
  const list: SearchResult[] = []
  const raw = await searchIndex.search(value, {
    enrich: true,
  })
  let rank = 0
  for (const field of raw) {
    for (const item of field.result as any[]) {
      switch (item.doc.kind) {
        case 'story': {
          list.push(storyResultFactory(storyStore.getStoryById(item.id), rank))
          rank++
          break
        }
        case 'variant': {
          const [storyId] = item.id.split(':')
          const story = storyStore.getStoryById(storyId)
          const variant = storyStore.getVariantById(item.id)
          list.push(variantResultFactory(story, variant, rank))
          rank++
          break
        }
      }
    }
  }
  results.value = list
})

function storyResultFactory (story: Story, rank: number): SearchResult {
  return {
    kind: 'story',
    rank,
    id: story.id,
    title: story.title,
    route: {
      name: 'story',
      params: {
        storyId: story.id,
      },
    },
    path: story.file.path.slice(0, -1),
    icon: story.icon,
    iconColor: story.iconColor,
  }
}

function variantResultFactory (story: Story, variant: Variant, rank: number): SearchResult {
  return {
    kind: 'variant',
    rank,
    id: variant.id,
    title: variant.title,
    route: {
      name: 'story',
      params: {
        storyId: story.id,
      },
      query: {
        variantId: variant.id,
      },
    },
    path: [...story.file.path ?? [], story.title],
    icon: variant.icon,
    iconColor: variant.iconColor,
  }
}

// Selection

const selectedIndex = ref(0)

watch(results, () => {
  selectedIndex.value = 0
})

function selectNext () {
  selectedIndex.value++
  if (selectedIndex.value > results.value.length - 1) {
    selectedIndex.value = 0
  }
}

function selectPrevious () {
  selectedIndex.value--
  if (selectedIndex.value < 0) {
    selectedIndex.value = results.value.length - 1
  }
}
</script>

<template>
  <div
    class="htw-flex htw-items-center htw-gap-4 htw-pl-6 htw-border htw-border-transparent focus-visible:htw-border-primary-500"
    @click="focused = true"
  >
    <Icon
      icon="carbon:search"
      class="flex-none htw-w-4 htw-h-4"
    />

    <input
      ref="input"
      v-model="searchInputText"
      placeholder="Search for stories, variants..."
      class="htw-bg-transparent htw-w-full htw-flex-1 htw-pl-0 htw-pr-6 htw-py-4 htw-outline-none"
      @keydown.down.prevent="selectNext()"
      @keydown.up.prevent="selectPrevious()"
      @keydown.escape="close()"
    >
  </div>

  <BaseEmpty v-if="rateLimitedSearch && !results.length">
    No results
  </BaseEmpty>

  <div
    v-else-if="results.length"
    class="htw-max-h-[400px] htw-overflow-y-auto htw-rounded-b-lg"
  >
    <SearchItem
      v-for="(result, index) of results"
      :key="`${result.kind}-${result.id}`"
      :result="result"
      :selected="index === selectedIndex"
      @close="close()"
    />
  </div>
</template>
