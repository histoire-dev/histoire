<script setup lang="ts">
import type { JobState, JobStepId } from '@histoire/shared'
import { BuiltinIcon, HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import InstallFooter from './InstallFooter.vue'
import OutputLog from './OutputLog.vue'

const props = defineProps<{
  /** Live server-owned state, including paused restart mode. */ job: JobState
  /** Actual browser-registered pane is available after load. */ canOpenPane: boolean
  /** Request restart is pending. */ restarting: boolean
}>()
defineEmits<{
  /** Dismiss workflow while server continues. */ background: []
  /** Resume the job held by ask mode; the server then restarts the dev server. */ restart: []
  /** Open an actual loaded contribution. */ open: []
  /** Close finished workflow. */ done: []
}>()
/** Frozen protocol labels follow the job's own package and version, including busy jobs. */
function label(step: JobStepId): string {
  return ({ resolve: `Resolved ${props.job.id}@${props.job.version}`, install: 'Installed package', config: 'Updated histoire.config.ts', restart: 'Restarting dev server', load: 'Loading plugin' })[step]
}
</script>

<template>
  <div class="htw:grid htw:gap-4 htw:px-[22px] htw:py-5">
    <ol aria-live="polite" aria-atomic="true" aria-label="Install progress" class="htw:m-0 htw:grid htw:list-none htw:gap-0.5 htw:p-0">
      <li v-for="step in job.steps" :key="step.id" class="htw:flex htw:items-center htw:gap-3 htw:py-[9px]" :class="step.state === 'pending' ? 'htw:text-muted' : 'htw:text-text'">
        <span class="htw:grid htw:size-[18px] htw:shrink-0 htw:place-items-center htw:text-accent">
          <HstPulsatingDisc v-if="step.state === 'running' && !job.awaiting" :size="16" />
          <BuiltinIcon v-else-if="step.state === 'done'" icon="checkmark-filled" :size="18" />
          <BuiltinIcon v-else-if="step.state === 'failed'" icon="error-filled" :size="18" class="htw:text-danger-text" />
          <span v-else aria-hidden="true" class="htw:size-3.5 htw:rounded-full htw:border htw:border-solid htw:border-border" />
        </span>
        <span class="htw:min-w-0 htw:flex-1 htw:break-words htw:font-semibold">{{ label(step.id) }}</span>
        <span class="htw:sr-only">{{ step.state }}</span>
        <span v-if="step.ms !== undefined" class="htw:font-mono htw:text-[11px] htw:text-muted">{{ step.ms }} ms</span>
      </li>
    </ol>
    <details open>
      <summary class="htw:mb-2 htw:cursor-pointer htw:font-bold htw:text-body">
        Output
      </summary>
      <OutputLog :output="job.output" />
    </details>
    <p v-if="job.awaiting === 'restart'" role="status" class="htw:m-0 htw:text-muted">
      Restart the dev server to finish
    </p>
  </div>
  <InstallFooter>
    <HstButton v-if="job.awaiting === 'continue'" color="primary" :disabled="restarting" @click="$emit('restart')">
      Restart now
    </HstButton>
    <HstButton v-if="job.status === 'running'" color="flat" @click="$emit('background')">
      Run in background
    </HstButton>
    <HstButton color="primary" :disabled="!canOpenPane" @click="$emit('open')">
      Open pane
    </HstButton>
    <HstButton v-if="job.status !== 'running'" color="flat" @click="$emit('done')">
      Done
    </HstButton>
  </InstallFooter>
</template>
