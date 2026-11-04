<script setup lang="ts">
import type { FrameScopedContext } from '@histoire/plugin-kit'
import type { DesignModel } from './model.js'
import { BuiltinIcon, HstButton, HstSelect } from '@histoire/controls/vue'
import { WorkbenchErrorState, WorkbenchLoadingState } from '@histoire/plugin-kit/vue'
import { computed, onScopeDispose, ref } from 'vue'
import DesignContent from './DesignContent.vue'

const props = defineProps<{
  /** Frame scope supplied by the host. */
  context: FrameScopedContext
  /** Shared design model. */
  model: DesignModel
}>()

// The model is not reactive: a revision counter makes computed values re-read it.
/** Bumped on every model change. */
const revision = ref(0)
onScopeDispose(props.model.subscribe(() => revision.value++))

/** Designs and invalid entries of the selected variant; `undefined` while its story loads. */
const designs = computed(() => {
  void revision.value
  return props.model.get(props.context.frame.target)
})
/** Design shown in the tab. */
const active = computed(() => {
  void revision.value
  return props.model.active(props.context.frame.target)
})
/** Switcher options; values are entry indexes. */
const options = computed(() => designs.value?.designs.map(design => ({ label: design.name, value: design.index })) ?? [])
/** Reasons why entries cannot be shown, numbered like the declared list. */
const issues = computed(() => designs.value?.issues.map(issue => `Entry ${issue.index + 1}: ${issue.message}`) ?? [])

/**
 * Switches to another design of this variant.
 * @param entryIndex Entry index of the chosen design.
 */
function select(entryIndex: number): void {
  props.model.select(props.context.frame.target, entryIndex)
}
</script>

<template>
  <section class="histoire-designs histoire-designs-tab" aria-label="Design">
    <WorkbenchLoadingState v-if="!designs" title="Loading designs" />
    <WorkbenchErrorState v-else-if="designs.error" title="Design unavailable">
      {{ designs.error }}
    </WorkbenchErrorState>
    <WorkbenchErrorState v-else-if="!active" title="Design unavailable">
      <span v-for="issue in issues" :key="issue" class="histoire-designs-issue">{{ issue }}</span>
    </WorkbenchErrorState>
    <template v-else>
      <div class="histoire-designs-toolbar">
        <HstSelect
          v-if="options.length > 1"
          class="histoire-designs-switch"
          aria-label="Design"
          :options="options"
          :model-value="active.index"
          @update:model-value="select"
        />
        <span v-else class="histoire-designs-name">{{ active.name }}</span>
        <HstButton as="a" color="flat" icon-only :href="active.externalUrl" target="_blank" rel="noopener noreferrer" aria-label="Open in new tab" title="Open in new tab">
          <BuiltinIcon icon="launch" :size="16" />
        </HstButton>
      </div>
      <p v-if="issues.length" class="histoire-designs-note" role="status">
        {{ issues.length === 1 ? '1 entry skipped' : `${issues.length} entries skipped` }}: {{ issues.join('; ') }}
      </p>
      <DesignContent :design="active" />
    </template>
  </section>
</template>
