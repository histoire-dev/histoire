<script lang="ts" setup>
import { useRoute, useRouter } from 'vue-router'
import { useStoryStore } from '../../stores/story'

import BaseSplitPane from '../base/BaseSplitPane.vue'
import BaseEmpty from '../base/BaseEmpty.vue'
import BaseTab from '../base/BaseTab.vue'
import StoryControls from './StoryControls.vue'
import StoryDocs from './StoryDocs.vue'
import StorySourceCode from './StorySourceCode.vue'

const storyStore = useStoryStore()

const router = useRouter()
const route = useRoute()
</script>

<template>
  <BaseEmpty v-if="!storyStore.currentVariant">
    <span>Select a variant</span>
  </BaseEmpty>

  <BaseEmpty v-else-if="!storyStore.currentVariant.ready">
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
        </nav>

        <component
          :is="$route.query.tab === 'docs'
            ? StoryDocs
            : StoryControls"
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
