<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import { useTestsStore } from '../../stores/tests'
import BaseButton from '../base/BaseButton.vue'
import BaseEmpty from '../base/BaseEmpty.vue'
import BaseTag from '../base/BaseTag.vue'
import StoryTestItem from './StoryTestItem.vue'

const testsStore = useTestsStore()

const definitions = computed(() => testsStore.currentDefinitions)
const summary = computed(() => testsStore.currentSummary)
const tests = computed(() => testsStore.currentTests)
</script>

<template>
  <div class="histoire-story-tests htw-flex htw-flex-col htw-h-full">
    <div class="htw-flex htw-items-center htw-justify-between htw-gap-3 htw-px-4 htw-py-3 htw-border-b htw-border-gray-100 dark:htw-border-gray-750">
      <div class="htw-flex htw-items-center htw-gap-2 htw-text-sm">
        <span class="htw-font-medium">Variant tests</span>
        <BaseTag v-if="summary">
          {{ summary.passed }}/{{ summary.total }} passing
        </BaseTag>
        <BaseTag v-else-if="definitions.length">
          {{ definitions.length }} collected
        </BaseTag>
      </div>

      <BaseButton
        color="primary"
        class="htw-px-3 htw-py-1.5 htw-text-sm"
        :disabled="testsStore.running"
        @click="testsStore.runCurrentVariantTests()"
      >
        {{ testsStore.running ? 'Running…' : 'Run tests' }}
      </BaseButton>
    </div>

    <div class="htw-flex-1 htw-overflow-auto">
      <BaseEmpty v-if="testsStore.currentCollecting && !definitions.length">
        <Icon
          icon="carbon:progress-bar-round"
          class="htw-w-8 htw-h-8 htw-opacity-50 htw-mb-2"
        />
        Collecting tests...
      </BaseEmpty>

      <BaseEmpty v-else-if="!definitions.length && !testsStore.running">
        <Icon
          icon="carbon:test-tool"
          class="htw-w-8 htw-h-8 htw-opacity-50 htw-mb-2"
        />
        No story tests registered for this variant
      </BaseEmpty>

      <BaseEmpty v-else-if="testsStore.running && !definitions.length">
        <Icon
          icon="carbon:progress-bar-round"
          class="htw-w-8 htw-h-8 htw-opacity-50 htw-mb-2"
        />
        Running tests...
      </BaseEmpty>

      <div
        v-else
        class="htw-p-4 htw-space-y-4"
        data-test-id="story-tests"
      >
        <div class="htw-flex htw-flex-wrap htw-gap-2">
          <BaseTag
            icon="carbon:list-checked"
            :class="{
              'htw-opacity-20': tests.length === 0,
            }"
          >
            Total {{ tests.length }}
          </BaseTag>
          <BaseTag
            icon="carbon:checkmark" color="success"
            :class="{
              'htw-opacity-20': (summary?.passed ?? 0) === 0,
            }"
          >
            Passed {{ summary?.passed ?? 0 }}
          </BaseTag>
          <BaseTag
            icon="carbon:close-large" color="error"
            :class="{
              'htw-opacity-20': (summary?.failed ?? 0) === 0,
            }"
          >
            Failed {{ summary?.failed ?? 0 }}
          </BaseTag>
          <BaseTag
            icon="carbon:skip-forward" color="warning"
            :class="{
              'htw-opacity-20': (summary?.skipped ?? 0) === 0,
            }"
          >
            Skipped {{ summary?.skipped ?? 0 }}
          </BaseTag>
          <BaseTag
            icon="carbon:circle-dash" color="secondary"
            :class="{
              'htw-opacity-20': tests.filter(test => test.state === 'idle').length === 0,
            }"
          >
            Not run {{ tests.filter(test => test.state === 'idle').length }}
          </BaseTag>
        </div>

        <div
          v-if="testsStore.currentStale"
          class="htw-text-xs htw-uppercase htw-tracking-wide htw-text-amber-600 dark:htw-text-amber-300"
        >
          Results are stale after story updates
        </div>

        <StoryTestItem
          v-for="test of tests"
          :key="test.id"
          :test="test"
        />
      </div>
    </div>
  </div>
</template>
