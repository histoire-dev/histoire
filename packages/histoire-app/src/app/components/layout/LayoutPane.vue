<script setup lang="ts">
import { useLayoutStore } from '../../stores/layout'
import LayoutItem from './LayoutItem.vue'
import LayoutItemGroup from './LayoutItemGroup.vue'

const layoutStore = useLayoutStore()
</script>

<template>
  <div class="htw-py-2">
    <LayoutItemGroup title="Visibility">
      <LayoutItem
        title="Story List"
        icon="carbon:open-panel-filled-left"
        :state-icon="layoutStore.settings.storyListVisible ? 'carbon:view' : 'carbon:view-off'"
        data-test-id="layout-toggle-story-list"
        @click="layoutStore.toggleStoryList()"
      />
      <LayoutItem
        title="Story Options"
        icon="carbon:open-panel-filled-right"
        :state-icon="layoutStore.settings.storyOptionsVisible ? 'carbon:view' : 'carbon:view-off'"
        data-test-id="layout-toggle-story-options"
        @click="layoutStore.toggleStoryOptions()"
      />
    </LayoutItemGroup>

    <LayoutItemGroup title="Story Options Placement">
      <LayoutItem
        title="Right"
        icon="carbon:open-panel-filled-right"
        :is-active="layoutStore.settings.storyOptionsPlacement === 'right'"
        data-test-id="layout-placement-right"
        @click="layoutStore.setStoryOptionsPlacement('right')"
      />
      <LayoutItem
        title="Bottom"
        icon="carbon:open-panel-filled-bottom"
        :is-active="layoutStore.settings.storyOptionsPlacement === 'bottom'"
        data-test-id="layout-placement-bottom"
        @click="layoutStore.setStoryOptionsPlacement('bottom')"
      />
    </LayoutItemGroup>
  </div>
</template>
