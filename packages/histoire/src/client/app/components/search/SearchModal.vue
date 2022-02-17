<script lang="ts" setup>
import { useFocus } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useStoryStore } from '../../stores/story'
import BaseEmpty from '../base/BaseEmpty.vue'
import type { SearchResult } from '../../types'
import SearchItem from './SearchItem.vue'

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
const { focused } = useFocus({
  target: input,
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

const search = ref('')

const storyStore = useStoryStore()

const results = computed(() => {
  const list: SearchResult[] = []
  if (search.value) {
    const s = search.value.toLowerCase()
    const variants: SearchResult[] = []
    for (const story of storyStore.stories) {
      const storyMatched = story.title.toLowerCase().includes(s)
      if (storyMatched) {
        list.push({
          kind: 'story',
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
        })
      }
      for (const variant of story.variants) {
        if (storyMatched || variant.title.toLowerCase().includes(s)) {
          variants.push({
            kind: 'variant',
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
            path: [...story.path ?? [], story.title],
            icon: variant.icon,
            iconColor: variant.iconColor,
          })
        }
      }
    }
    list.push(...variants)
  }
  return list
})

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
    v-show="shown"
    class="htw-fixed htw-inset-0 htw-bg-white/80 dark:htw-bg-gray-700/80"
  >
    <div
      class="htw-absolute htw-inset-0"
      @click="close()"
    />
    <div class="htw-bg-white dark:htw-bg-gray-700 md:htw-mt-16 md:htw-mx-auto htw-w-screen htw-max-w-[512px] htw-shadow-xl htw-border htw-border-gray-200 dark:htw-border-gray-850 htw-rounded-lg htw-relative htw-divide-y htw-divide-gray-200 dark:htw-divide-gray-850">
      <div
        class="htw-flex htw-items-center htw-gap-4 htw-pl-6 htw-border htw-border-transparent focus-visible:htw-border-primary-500"
        @click="focused = true"
      >
        <Icon
          icon="carbon:search"
          class="flex-none htw-w-5 htw-h-5"
        />

        <input
          ref="input"
          v-model="search"
          placeholder="Search for stories, variants..."
          class="htw-bg-transparent htw-w-full htw-flex-1 htw-pr-6 htw-py-4 htw-outline-none"
          @keydown.down="selectNext()"
          @keydown.up="selectPrevious()"
        >
      </div>

      <BaseEmpty v-if="search && !results.length">
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
    </div>
  </div>
</template>
