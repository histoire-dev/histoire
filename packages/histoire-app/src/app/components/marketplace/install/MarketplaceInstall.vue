<script setup lang="ts">
import { HstButton } from '@histoire/controls/vue'
import { computed, onScopeDispose, ref, useId, watch } from 'vue'
import { useContributionLookup } from '../../../composables/shell-extensions.js'
import WorkbenchEmptyState from '../../shell/WorkbenchEmptyState.vue'
import WorkbenchErrorState from '../../shell/WorkbenchErrorState.vue'
import WorkbenchLoadingState from '../../shell/WorkbenchLoadingState.vue'
import FailureStep from './FailureStep.vue'
import ManualStep from './ManualStep.vue'
import OptionsStep from './OptionsStep.vue'
import ProgressStep from './ProgressStep.vue'
import ReviewStep from './ReviewStep.vue'
import { useInstallWizard } from './use-install-wizard.js'
import WizardSteps from './WizardSteps.vue'

const { store, detail, values, fields, intent, plan, loading, step, error, planError, notice, starting, restarting, openAfter, manual, forcedManual, activeJob, load, replan, install, retry, restart, setRestart, copyCommands } = useInstallWizard()
const titleId = `marketplace-install-${useId()}`
/** A busy job can belong to a different package than requested detail. */
const pluginName = computed(() => activeJob.value && activeJob.value.id !== detail.value?.id
  ? activeJob.value.id
  : detail.value?.displayName ?? store.selectedId.value ?? 'plugin')
/** Manual recovery uses normal card even when retained job failed. */
const failed = computed(() => !manual.value && activeJob.value?.status === 'failed')
const title = computed(() => {
  if (manual.value) return `Install ${pluginName.value} manually`
  if (activeJob.value) {
    const status = activeJob.value.status
    return `${status === 'succeeded' ? 'Installed' : status === 'cancelled' ? 'Install cancelled' : 'Installing'} ${pluginName.value}`
  }
  return step.value === 1 ? 'Review project changes' : `Install ${pluginName.value}`
})
/** Return to selected plugin without starting or cancelling server work. */
function cancel(): void {
  const id = store.selectedId.value
  store.back()
  if (id && (store.view.value !== 'detail' || store.selectedId.value !== id)) store.showPlugin(id)
}
const panes = useContributionLookup('shell.pane')
const paneLabel = computed(() => detail.value?.adds.find(add => add.kind === 'rail-pane')?.text)
// Only actual browser registrations enable navigation; manifest adds are promises.
const pluginId = ref<string>()
const pane = computed(() => panes.list().find(item => item.pluginId === pluginId.value))
const loaded = computed(() => activeJob.value?.status === 'succeeded' && activeJob.value.steps.some(item => item.id === 'load' && item.state === 'done'))
let disposed = false
// npm identity differs from descriptor id (e.g. @histoire/plugin-a11y owns a11y:*).
watch([loaded, () => activeJob.value?.id], async ([ready, id]) => {
  pluginId.value = undefined
  if (!ready || !id) return
  try {
    const { installedPlugins } = await import('virtual:$histoire-config')
    if (!disposed && activeJob.value?.id === id && loaded.value) pluginId.value = installedPlugins.find(plugin => plugin.packageName === id)?.id
  }
  catch { /* Hosts without standalone metadata keep pane navigation unavailable. */ }
}, { immediate: true })
onScopeDispose(() => {
  disposed = true
})
const canOpenPane = computed(() => loaded.value && !!pane.value)
/** Open only a registered contribution after the server load check succeeds. */
function openPane(): void {
  if (!canOpenPane.value || !pane.value || !panes.workbench) return
  panes.workbench.context.navigation.openPane(pane.value.id)
  if (activeJob.value) store.acknowledgePostInstall(activeJob.value.jobId)
  store.close()
}
watch(canOpenPane, (available) => {
  if (available && store.postInstall.value?.jobId === activeJob.value?.jobId && store.postInstall.value?.openPane) openPane()
})
</script>

<template>
  <section v-if="store.open.value" aria-label="Install plugin" class="htw:min-h-0 htw:min-w-0 htw:flex-1 htw:overflow-auto htw:bg-canvas htw:px-6 htw:py-6 htw:md:px-8">
    <div class="htw:mx-auto htw:flex htw:w-full htw:flex-col htw:gap-3.5" :class="failed ? 'htw:max-w-[600px]' : 'htw:max-w-[920px]'">
      <nav aria-label="Install breadcrumb" class="htw:flex htw:flex-wrap htw:items-center htw:gap-1.5 htw:text-[13px] htw:font-semibold htw:text-muted">
        <HstButton color="flat" class="htw:h-auto htw:p-0" @click="store.setView('all')">
          All plugins
        </HstButton>
        <span aria-hidden="true">/</span>
        <HstButton color="flat" class="htw:h-auto htw:p-0" @click="cancel">
          {{ pluginName }}
        </HstButton>
        <span aria-hidden="true">/</span><span aria-current="page" class="htw:text-text">Install</span>
      </nav>
      <section :aria-labelledby="failed ? undefined : titleId" :aria-label="failed ? `Install ${pluginName}` : undefined" class="htw:flex htw:flex-col htw:overflow-hidden htw:rounded-2xl htw:border htw:border-solid htw:border-border htw:bg-surface htw:text-[13px] htw:text-text">
        <header v-if="!failed" class="htw:flex htw:flex-wrap htw:items-center htw:gap-3.5 htw:border-0 htw:border-b htw:border-solid htw:border-border htw:px-[22px] htw:py-[18px]">
          <h1 :id="titleId" class="htw:m-0 htw:flex-1 htw:text-[17px] htw:font-extrabold">
            {{ title }}
          </h1>
          <WizardSteps v-if="!manual" :active="activeJob ? 2 : step" :locked="!!activeJob || starting" @select="step = $event" />
        </header>
        <p v-if="notice" role="status" class="htw:mx-[22px] htw:my-3 htw:rounded-lg htw:bg-accent-soft htw:p-3 htw:text-accent-text">
          {{ notice }}
        </p>
        <WorkbenchErrorState v-if="error || planError" title="Couldn't prepare install" class="htw:p-[22px]" flush>
          {{ error ?? planError }}
          <template #actions>
            <HstButton color="flat" @click="detail ? replan() : load()">
              Retry
            </HstButton>
          </template>
        </WorkbenchErrorState>
        <ManualStep v-if="manual" :plan="manual" :forced="forcedManual" @done="store.close" />
        <FailureStep v-else-if="activeJob?.status === 'failed'" :job="activeJob" @retry="retry()" @version="retry" @manual="copyCommands" />
        <ProgressStep v-else-if="activeJob" :job="activeJob" :can-open-pane="canOpenPane" :restarting="restarting" @background="store.setView('all')" @restart="restart" @open="openPane" @done="store.close" />
        <WorkbenchEmptyState v-else-if="!store.installRequest.value" icon="plug" title="Select a plugin" tone="neutral" />
        <template v-else-if="!detail">
          <WorkbenchLoadingState v-if="!error" title="Loading options" immediate />
        </template>
        <ReviewStep v-else-if="step === 1 && plan && !loading" :plan="plan" :plugin="detail" :restart="intent?.prefs.afterInstall === 'restart'" :pane="paneLabel" :open-pane="openAfter" :starting="starting" @restart="setRestart" @open="openAfter = $event" @install="install" @manual="copyCommands" @back="step = 0" @cancel="cancel" />
        <WorkbenchLoadingState v-else-if="step === 1" title="Planning changes" immediate />
        <OptionsStep v-else-if="intent" :fields="fields" :values="values" :plan="plan" :loading="loading" @change="(key, value) => values[key] = value" @continue="step = 1" @cancel="cancel" />
        <WorkbenchEmptyState v-else icon="plug" title="Select a plugin" tone="neutral" />
      </section>
    </div>
  </section>
</template>
