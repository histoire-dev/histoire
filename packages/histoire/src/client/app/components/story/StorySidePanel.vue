<script lang="ts" setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStoryStore } from '../../stores/story'
import { useEventsStore } from '../../stores/events'

import BaseSplitPane from '../base/BaseSplitPane.vue'
import BaseEmpty from '../base/BaseEmpty.vue'
import BaseTab from '../base/BaseTab.vue'
import StoryControls from './StoryControls.vue'
import StoryDocs from './StoryDocs.vue'
import StoryEvents from './StoryEvents.vue'
import StorySourceCode from './StorySourceCode.vue'

const storyStore = useStoryStore()
const eventsStore = useEventsStore()

const router = useRouter()
const route = useRoute()

const panelContentComponent = computed(() => {
  switch (route.query.tab) {
    case 'docs':
      return StoryDocs
    case 'events':
      return StoryEvents
    default:
      return StoryControls
  }
})
</script>

<template>
  <BaseEmpty v-if="!storyStore.currentVariant">
    <span>Select a variant</span>
  </BaseEmpty>

  <BaseEmpty v-else-if="!storyStore.currentVariant.previewReady">
    <span>Loading...</span>
  </BaseEmpty>

  <BaseSplitPane
    v-else
    save-id="story-sidepane"
    orientation="portrait"
    class="htw-h-full"
    data-test-id="story-side-panel"
  >
    <template #first>
      <div class="htw-flex htw-flex-col htw-h-full">
        <nav class="htw-h-10 htw-flex-none htw-border-b htw-border-gray-100 dark:htw-border-gray-750">
          <BaseTab
            :to="{ ...$route, query: { ...$route.query, tab: '' } }"
            :matched="!$route.query.tab"
          >
            Controls
          </BaseTab>
          <BaseTab
            :to="{ ...$route, query: { ...$route.query, tab: 'docs' } }"
            :matched="$route.query.tab === 'docs'"
          >
            Docs
          </BaseTab>
          <BaseTab
            :to="{ ...$route, query: { ...$route.query, tab: 'events' } }"
            :matched="$route.query.tab === 'events'"
          >
            Events
            <span
              v-if="eventsStore.unseen"
              class="htw-text-center htw-text-gray-900 dark:htw-text-gray-100 htw-text-xs htw-mx-1 htw-px-0.5 htw-h-4 htw-min-w-4 htw-rounded-full active htw-bg-primary-500 htw-text-white dark:htw-text-black"
            >
              {{ eventsStore.unseen <=99 ? eventsStore.unseen : "99+" }}
            </span>
          </BaseTab>
        </nav>

        <component
          :is="panelContentComponent"
          :story="storyStore.currentStory"
          :variant="storyStore.currentVariant"
          class="htw-h-full htw-overflow-auto"
        />
      </div>
    </template>

    <template #last>
      <StorySourceCode
        :variant="storyStore.currentVariant"
        class="htw-h-full"
      />
    </template>
  </BaseSplitPane>
</template>
