<script setup lang="ts">
import type { JobState } from '@histoire/shared'
import { HstButton } from '@histoire/controls/vue'
import WorkbenchErrorState from '../../shell/WorkbenchErrorState.vue'
import InstallFooter from './InstallFooter.vue'
import OutputLog from './OutputLog.vue'
import { useCopy } from './use-copy.js'

defineProps<{
  /** Terminal failure with truthful rollback and leftovers. */ job: JobState
}>()
defineEmits<{
  /** Replan current version; never reuse stale capability. */ retry: []
  /** Review alternative before admitting another job. */ version: [version: string]
  /** Copy manual instructions. */ manual: []
}>()
const { status, copy } = useCopy()
</script>

<template>
  <div class="htw:grid htw:gap-3 htw:px-[22px] htw:pt-8 htw:pb-[18px]">
    <WorkbenchErrorState title="Install failed" flush>
      {{ job.failure?.message }} <span v-if="job.failure?.restored">No project files were changed.</span>
    </WorkbenchErrorState>
    <OutputLog :output="job.output" />
    <div v-if="job.failure?.suggestion" class="htw:flex htw:flex-wrap htw:items-center htw:gap-3 htw:rounded-xl htw:border htw:border-solid htw:border-border htw:px-3.5 htw:py-3">
      <div class="htw:min-w-0 htw:flex-1">
        <p class="htw:m-0 htw:font-extrabold">
          Install {{ job.failure.suggestion.version }} instead
        </p>
        <p class="htw:m-0 htw:mt-0.5 htw:text-xs htw:text-muted">
          {{ job.failure.suggestion.reason }}
        </p>
      </div>
      <HstButton :aria-label="`Install ${job.failure.suggestion.version} instead`" @click="$emit('version', job.failure.suggestion.version)">
        Use {{ job.failure.suggestion.version }}
      </HstButton>
    </div>
    <ul v-if="job.failure?.leftovers.length" aria-label="Remaining changes" class="htw:m-0 htw:pl-5 htw:text-xs htw:text-muted">
      <li v-for="item in job.failure.leftovers" :key="item">
        {{ item }}
      </li>
    </ul>
    <span v-if="status" role="status" class="htw:text-xs htw:text-muted">{{ status }}</span>
  </div>
  <InstallFooter>
    <template #leading>
      <HstButton color="flat" @click="copy(job.output.join('\n'))">
        Copy log
      </HstButton>
    </template>
    <HstButton @click="$emit('manual')">
      Install manually
    </HstButton>
    <HstButton color="primary" @click="$emit('retry')">
      Retry
    </HstButton>
  </InstallFooter>
</template>
