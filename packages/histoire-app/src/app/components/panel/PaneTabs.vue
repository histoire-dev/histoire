<script lang="ts" setup>
import { computed, toRefs } from 'vue'
import BaseTab from '../base/BaseTab.vue'
import { useEventsStore } from '../../stores/events'
import type { Story, Variant } from '../../types'
import BaseOverflowMenu from '../base/BaseOverflowMenu.vue'
import BaseOverflowTab from '../base/BaseOverflowTab.vue'
import { useStoryDoc } from './StoryDocs.vue'

const props = defineProps<{
  story: Story
  variant: Variant
}>()

const { story } = toRefs(props)

const { renderedDoc } = useStoryDoc(story)

const eventsStore = useEventsStore()
const hasEvents = computed(() => eventsStore.events.length)
</script>

<template>
  <BaseOverflowMenu class="htw-h-10 htw-flex-none htw-border-b htw-border-gray-100 dark:htw-border-gray-750">
    <BaseTab
      :to="{ ...$route, query: { ...$route.query, tab: '' } }"
      :matched="!$route.query.tab"
    >
      Controls
    </BaseTab>
    <BaseTab
      :to="{ ...$route, query: { ...$route.query, tab: 'docs' } }"
      :matched="$route.query.tab === 'docs'"
      :class="{
        'htw-opacity-50': !renderedDoc,
      }"
    >
      Docs
    </BaseTab>
    <BaseTab
      :to="{ ...$route, query: { ...$route.query, tab: 'events' } }"
      :matched="$route.query.tab === 'events'"
      :class="{
        'htw-opacity-50': !hasEvents,
      }"
    >
      Events
      <span
        v-if="eventsStore.unseen"
        class="htw-text-center htw-text-xs htw-mx-1 htw-px-0.5 htw-h-4 htw-min-w-4 htw-rounded-full active htw-bg-primary-500 htw-text-white dark:htw-text-black"
      >
        {{ eventsStore.unseen <=99 ? eventsStore.unseen : "99+" }}
      </span>
    </BaseTab>

    <template #overflow>
      <BaseOverflowTab
        :to="{ ...$route, query: { ...$route.query, tab: '' } }"
        :matched="!$route.query.tab"
      >
        Controls
      </BaseOverflowTab>
      <BaseOverflowTab
        :to="{ ...$route, query: { ...$route.query, tab: 'docs' } }"
        :matched="$route.query.tab === 'docs'"
        :class="{
          'opacity-50': !renderedDoc,
        }"
      >
        Docs
      </BaseOverflowTab>
      <BaseOverflowTab
        :to="{ ...$route, query: { ...$route.query, tab: 'events' } }"
        :matched="$route.query.tab === 'events'"
        :class="{
          'htw-opacity-50': !hasEvents,
        }"
      >
        Events
        <span
          v-if="eventsStore.unseen"
          class="htw-text-center htw-text-xs htw-mx-1 htw-px-0.5 htw-h-4 htw-min-w-4 htw-rounded-full active htw-bg-primary-500 htw-text-white dark:htw-text-black"
        >
          {{ eventsStore.unseen <= 99 ? eventsStore.unseen : "99+" }}
        </span>
      </BaseOverflowTab>
    </template>
  </BaseOverflowMenu>
</template>
