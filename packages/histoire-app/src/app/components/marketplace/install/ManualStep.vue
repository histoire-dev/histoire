<script setup lang="ts">
import type { ChangePlan, ManualStep } from '@histoire/shared'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { computed, ref, useId } from 'vue'
import CommandBlock from './CommandBlock.vue'
import InstallFooter from './InstallFooter.vue'
import { useCopy } from './use-copy.js'

const props = defineProps<{
  /** Plan with ordered, copyable instructions. */ plan: ChangePlan
  /** User explicitly chose commands from an editable project. */ forced?: boolean
}>()
defineEmits<{
  /** Exit after manual steps are copied or completed. */ done: []
}>()
const selected = ref(props.plan.packageManager.name)
const prefix = `marketplace-manager-${useId()}`
const { status, copy } = useCopy()
const managers = computed(() => [props.plan.packageManager.name, ...(['pnpm', 'npm', 'yarn', 'bun'] as const).filter(name => name !== props.plan.packageManager.name)])
const reason = computed(() => ({ 'static': 'Static build. Run these steps in your project.', 'config-not-literal': 'Config requires a manual edit.', 'no-package-manager': 'No package manager found.', 'migration-manual': 'Config migration requires a manual edit.', 'workspace-unsupported': 'Workspace requires a manual install.' })[props.plan.manual?.reason ?? 'config-not-literal'])
/** Choose only this manager's command, preserving server-provided config text verbatim. */
const steps = computed(() => {
  const all = props.plan.manual?.steps ?? []
  return all.filter(step => !/^Run with (?:pnpm|npm|yarn|bun)$/.test(step.title) || step.title === `Run with ${selected.value}`)
})
/** Static instructions end with rebuild, replacing the development restart instruction. */
function title(step: ManualStep): string {
  if (/^Run with (?:pnpm|npm|yarn|bun)$/.test(step.title)) return 'Install the package'
  return props.plan.manual?.reason === 'static' && step.title === 'Restart Histoire' ? 'Rebuild with histoire build' : step.title
}
/** Roving manager tabs support arrows, Home and End. */
function navigate(event: KeyboardEvent): void {
  const names = managers.value
  const index = names.indexOf(selected.value)
  const next = event.key === 'ArrowRight' ? (index + 1) % names.length : event.key === 'ArrowLeft' ? (index + names.length - 1) % names.length : event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : -1
  if (next < 0) return
  event.preventDefault()
  selected.value = names[next]
  const list = event.currentTarget as HTMLElement
  list.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
}
</script>

<template>
  <div class="htw:grid htw:gap-5 htw:px-[22px] htw:py-5">
    <div v-if="!forced" class="htw:flex htw:items-center htw:gap-3 htw:rounded-xl htw:bg-chip htw:px-3.5 htw:py-3">
      <BuiltinIcon icon="information" :size="18" class="htw:shrink-0 htw:text-muted" />
      <div class="htw:grid htw:gap-0.5">
        <p class="htw:m-0 htw:font-extrabold">
          This workbench can't edit project files
        </p>
        <p class="htw:m-0 htw:text-xs htw:text-muted">
          {{ reason }}
        </p>
      </div>
    </div>
    <ol class="htw:m-0 htw:grid htw:list-none htw:gap-[18px] htw:p-0">
      <li v-for="(step, index) in steps" :key="index" class="htw:flex htw:gap-3">
        <span aria-hidden="true" class="htw:grid htw:size-6 htw:shrink-0 htw:place-items-center htw:rounded-full htw:bg-chip htw:text-xs htw:font-bold htw:text-body">{{ index + 1 }}</span>
        <div class="htw:grid htw:min-w-0 htw:flex-1 htw:gap-2">
          <div class="htw:flex htw:flex-wrap htw:items-center htw:justify-between htw:gap-2">
            <h2 class="htw:m-0 htw:text-[13px] htw:font-extrabold">
              {{ title(step) }}
            </h2>
            <div v-if="index === 0" role="tablist" aria-label="Package manager" class="htw:flex htw:flex-wrap htw:gap-0.5 htw:rounded-[9px] htw:bg-chip htw:p-[3px]" @keydown="navigate">
              <HstButton v-for="name in managers" :id="`${prefix}-${name}`" :key="name" role="tab" color="flat" :aria-selected="selected === name" :aria-controls="`${prefix}-panel`" :tabindex="selected === name ? 0 : -1" class="htw:h-[26px] htw:rounded-[7px] htw:px-2.5 htw:text-xs" :class="selected === name ? 'htw:bg-surface htw:text-text htw:shadow-sm' : 'htw:text-muted'" @click="selected = name">
                {{ name }}
              </HstButton>
            </div>
          </div>
          <div :id="index === 0 ? `${prefix}-panel` : undefined" :role="index === 0 ? 'tabpanel' : undefined" :aria-labelledby="index === 0 ? `${prefix}-${selected}` : undefined">
            <CommandBlock v-if="step.code" :code="step.code" :label="index === 0 ? 'Copy command' : 'Copy snippet'" />
          </div>
        </div>
      </li>
    </ol>
  </div>
  <InstallFooter>
    <span v-if="status" role="status" class="htw:mr-auto htw:text-xs htw:text-muted">{{ status }}</span>
    <HstButton @click="copy(steps.map(step => step.code ?? title(step)).join('\n\n'))">
      Copy all
    </HstButton>
    <HstButton color="primary" @click="$emit('done')">
      Done
    </HstButton>
  </InstallFooter>
</template>
