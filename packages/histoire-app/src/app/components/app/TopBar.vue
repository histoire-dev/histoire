<script lang="ts" setup>
import { useStoryStore } from '../../stores/story'
import DevOnlyToolbarOpenInEditor from '../toolbar/DevOnlyToolbarOpenInEditor.vue'
import ToolbarBackground from '../toolbar/ToolbarBackground.vue'
import ToolbarNewTab from '../toolbar/ToolbarNewTab.vue'
import ToolbarResponsiveSize from '../toolbar/ToolbarResponsiveSize.vue'
import ToolbarTextDirection from '../toolbar/ToolbarTextDirection.vue'
import ToolbarTitle from '../toolbar/ToolbarTitle.vue'
import AppActions from './AppActions.vue'
import TopBarChip from './TopBarChip.vue'

defineEmits({
  search: () => true,
  layout: () => true,
})

const storyStore = useStoryStore()
</script>

<template>
  <div class="histoire-top-bar htw-flex-none htw-flex htw-items-center htw-h-14 htw-px-4 htw-gap-3">
    <div class="htw-flex-1 htw-flex htw-items-center htw-justify-start htw-min-w-0">
      <AppActions
        class="htw-flex-none"
        @layout="$emit('layout')"
        @search="$emit('search')"
      />
    </div>

    <div class="htw-flex-none htw-flex htw-items-center htw-justify-center htw-min-w-0">
      <TopBarChip
        v-if="storyStore.currentStory || storyStore.currentVariant"
        class="htw-px-6 htw-py-1.5 htw-max-w-full"
      >
        <ToolbarTitle
          :variant="storyStore.currentVariant ?? undefined"
          :story="storyStore.currentStory ?? undefined"
        />
      </TopBarChip>
    </div>

    <div class="htw-flex-1 htw-flex htw-items-center htw-justify-end htw-min-w-0">
      <TopBarChip
        v-if="storyStore.currentStory && !storyStore.currentStory.docsOnly"
      >
        <ToolbarResponsiveSize
          v-if="storyStore.currentVariant && !storyStore.currentVariant.responsiveDisabled"
        />
        <ToolbarBackground />
        <ToolbarTextDirection />
        <ToolbarNewTab
          v-if="storyStore.currentVariant"
          :variant="storyStore.currentVariant"
          :story="storyStore.currentStory"
        />
        <DevOnlyToolbarOpenInEditor
          v-if="__HISTOIRE_DEV__"
          :file="storyStore.currentStory.file?.filePath"
          tooltip="Edit story in editor"
        />
      </TopBarChip>
    </div>
  </div>
</template>
