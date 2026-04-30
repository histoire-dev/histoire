<script setup lang="ts">
import { useLayoutStore } from '../../stores/layout'
import LayoutItem from './LayoutItem.vue'
import LayoutItemGroup from './LayoutItemGroup.vue'

const settings = useLayoutStore().settings
</script>

<template>
  <div class="htw-py-2">
    <LayoutItemGroup title="Visibility">
      <LayoutItem
        title="Story List"
        icon="carbon:open-panel-filled-left"
        :state-icon="settings.storyListVisible ? 'carbon:view' : 'carbon:view-off'"
        data-test-id="layout-toggle-story-list"
        @click="settings.storyListVisible = !settings.storyListVisible"
      />
      <LayoutItem
        title="Story Options"
        icon="carbon:open-panel-filled-right"
        :state-icon="settings.storyOptionsVisible ? 'carbon:view' : 'carbon:view-off'"
        data-test-id="layout-toggle-story-options"
        @click="settings.storyOptionsVisible = !settings.storyOptionsVisible"
      />
    </LayoutItemGroup>

    <LayoutItemGroup title="Story Options Placement">
      <LayoutItem
        title="Right"
        icon="carbon:open-panel-filled-right"
        :is-active="settings.storyOptionsPlacement === 'right'"
        data-test-id="layout-placement-right"
        @click="settings.storyOptionsPlacement = 'right'"
      />
      <LayoutItem
        title="Bottom"
        icon="carbon:open-panel-filled-bottom"
        :is-active="settings.storyOptionsPlacement === 'bottom'"
        data-test-id="layout-placement-bottom"
        @click="settings.storyOptionsPlacement = 'bottom'"
      />
    </LayoutItemGroup>
  </div>
</template>
