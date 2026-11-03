<script setup lang="ts">
import type { QualifiedContribution, WorkbenchContext } from '@histoire/plugin-kit'
import { contributionKey } from '../../extensions/shell-registry.js'
import ExtensionView from '../extensions/ExtensionView.vue'
import WorkbenchLoadingState from './WorkbenchLoadingState.vue'
import WorkbenchPaneHeader from './WorkbenchPaneHeader.vue'

defineProps<{
  /** Plugin pane to render; absent while plugin setup has not settled. */
  pane?: QualifiedContribution<'shell.pane'>
  /** Root workbench context handed to the view. */
  context?: WorkbenchContext
}>()
</script>

<template>
  <template v-if="pane && context">
    <WorkbenchPaneHeader v-if="pane.header !== false" :title="pane.label" />
    <ExtensionView :key="contributionKey(pane)" class="htw:flex htw:flex-1 htw:flex-col htw:min-h-0 htw:overflow-auto" :contribution="pane" :context="context" />
  </template>
  <WorkbenchLoadingState v-else title="Loading pane" />
</template>
