<script setup lang="ts">
import type { ChangePlan, PluginDetail } from '@histoire/shared'
import { BuiltinIcon, HstButton, HstCheckbox } from '@histoire/controls/vue'
import CommandBlock from './CommandBlock.vue'
import ConfigDiff from './ConfigDiff.vue'
import InstallFooter from './InstallFooter.vue'

defineProps<{
  /** Exact plan to admit. */ plan: ChangePlan
  /** Declarative publisher metadata. */ plugin: PluginDetail
  /** Restart choice becomes part of a newly reviewed plan. */ restart: boolean
  /** Optional rail-pane label advertised by manifest. */ pane?: string
  /** Whether successful install should open actual registered pane. */ openPane: boolean
  /** Prevent double admission. */ starting: boolean
}>()
defineEmits<{
  /** Change policy and replan before admission. */ restart: [value: boolean]
  /** Select post-install navigation. */ open: [value: boolean]
  /** Return to current options without clearing values. */ back: []
  /** Leave install without admitting a job. */ cancel: []
  /** Start this plan. */ install: []
  /** Show manual commands. */ manual: []
}>()
</script>

<template>
  <div class="htw:grid htw:gap-[18px] htw:px-[22px] htw:py-5">
    <div class="htw:flex htw:items-center htw:gap-3 htw:rounded-xl htw:px-3.5 htw:py-3" :class="plugin.official ? 'htw:bg-accent-soft htw:text-accent-text' : 'htw:bg-chip htw:text-body'">
      <BuiltinIcon icon="checkmark-filled" :size="20" class="htw:shrink-0" />
      <div class="htw:grid htw:gap-0.5">
        <span class="htw:font-extrabold">{{ plugin.official ? 'Official plugin' : plugin.displayName }}</span>
        <span class="htw:text-xs">Published by {{ plugin.publisher }}<template v-if="plugin.provenance"> · Published with npm provenance</template></span>
      </div>
    </div>
    <section v-if="plan.command" class="htw:grid htw:gap-2" aria-label="Command">
      <h2 class="htw:m-0 htw:text-[11px] htw:font-bold htw:tracking-wide htw:text-muted htw:uppercase">
        Command
      </h2>
      <CommandBlock :code="plan.command.display" label="Copy command" />
    </section>
    <section class="htw:grid htw:gap-2" aria-label="Files">
      <h2 class="htw:m-0 htw:text-[11px] htw:font-bold htw:tracking-wide htw:text-muted htw:uppercase">
        Files
      </h2>
      <ConfigDiff :files="plan.files" collapsible />
    </section>
    <p v-for="warning in plan.warnings" :key="warning" role="note" class="htw:m-0 htw:rounded-lg htw:bg-warn/10 htw:p-3 htw:text-body">
      {{ warning }}
    </p>
    <div class="htw:grid htw:gap-2.5">
      <HstCheckbox class="htw:m-0 htw:flex-row-reverse htw:p-0" title="Restart dev server when done" :model-value="restart" :disabled="starting" @update:model-value="$emit('restart', $event === true)">
        <span class="htw:font-sans htw:font-semibold">Restart dev server when done</span>
      </HstCheckbox>
      <HstCheckbox v-if="pane" class="htw:m-0 htw:flex-row-reverse htw:p-0" :title="`Open ${pane} after install`" :model-value="openPane" :disabled="starting" @update:model-value="$emit('open', $event === true)">
        <span class="htw:font-sans htw:font-semibold">Open {{ pane }} after install</span>
      </HstCheckbox>
    </div>
  </div>
  <InstallFooter>
    <template #leading>
      <HstButton color="flat" :disabled="starting" @click="$emit('manual')">
        Copy commands instead
      </HstButton>
    </template>
    <HstButton color="flat" :disabled="starting" @click="$emit('cancel')">
      Cancel
    </HstButton>
    <HstButton :disabled="starting" @click="$emit('back')">
      Back
    </HstButton>
    <HstButton color="primary" :disabled="starting" @click="$emit('install')">
      Install
    </HstButton>
  </InstallFooter>
</template>
