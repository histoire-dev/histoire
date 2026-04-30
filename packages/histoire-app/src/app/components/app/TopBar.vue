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
  <div class="histoire-top-bar htw-flex-none htw-grid htw-grid-cols-[1fr_auto_1fr] htw-items-center htw-h-14 htw-px-4 htw-gap-3">
    <AppActions
      class="htw-justify-self-start"
      @layout="$emit('layout')"
      @search="$emit('search')"
    />

    <TopBarChip
      v-if="storyStore.currentStory || storyStore.currentVariant"
      class="htw-px-6 htw-py-1.5 htw-max-w-full"
    >
      <ToolbarTitle
        :variant="storyStore.currentVariant ?? undefined"
        :story="storyStore.currentStory ?? undefined"
      />
    </TopBarChip>
    <span v-else />

    <TopBarChip
      v-if="storyStore.currentStory && !storyStore.currentStory.docsOnly"
      class="htw-justify-self-end"
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
</template>
