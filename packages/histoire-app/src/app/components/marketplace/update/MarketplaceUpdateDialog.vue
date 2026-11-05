<script setup lang="ts">
import type { MarketplaceTransport } from '../../../util/marketplace-client.js'
import { BuiltinIcon, HstButton, HstCheckbox, HstPulsatingDisc } from '@histoire/controls/vue'
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import WorkbenchErrorState from '../../shell/WorkbenchErrorState.vue'
import WorkbenchLoadingState from '../../shell/WorkbenchLoadingState.vue'
import CommandBlock from '../install/CommandBlock.vue'
import ConfigDiff from '../install/ConfigDiff.vue'
import PluginTile from '../shell/PluginTile.vue'
import ReleaseNotes from './ReleaseNotes.vue'
import { useUpdateDialog } from './use-update-dialog.js'

const props = defineProps<{
  /** Optional external channel for embedded hosts and source behavior tests. */ transport?: MarketplaceTransport
}>()
const state = useUpdateDialog(props.transport)
const { store, detail, apply, hasMigrations, loading, error, starting, active, busy, progress, review } = state
const { plan, loading: planning, error: planError } = review
const dialog = ref<HTMLDialogElement>()
const title = useId()
let opener: HTMLElement | undefined
/** Native top layer traps focus; preserve the settings action that opened this visit. */
function synchronize(): void {
  if (store.updateTarget.value && !dialog.value?.open) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    dialog.value?.showModal()
  }
  else if (!store.updateTarget.value && dialog.value?.open) {
    dialog.value.close()
    const target = opener
    void nextTick(() => {
      if (!store.updateTarget.value && target?.isConnected) target.focus()
    })
  }
}
watch(store.updateTarget, synchronize, { flush: 'post' })
onMounted(synchronize)
onBeforeUnmount(() => {
  dialog.value?.close()
})
</script>

<template>
  <dialog ref="dialog" role="dialog" aria-modal="true" :aria-labelledby="title" class="htw:fixed htw:inset-0 htw:m-auto htw:box-border htw:max-h-[calc(100dvh_-_32px)] htw:w-[min(620px,calc(100vw_-_32px))] htw:overflow-auto htw:rounded-2xl htw:border-0 htw:bg-surface htw:p-0 htw:text-text htw:text-[13px] htw:shadow-panel htw:[&:not([open])]:hidden htw:backdrop:bg-scrim" @cancel.prevent="state.dismiss" @close="!dialog?.open && store.updateTarget.value && state.dismiss()" @keydown.esc.stop.prevent="state.dismiss" @keydown.stop @pointerdown.stop @wheel.stop>
    <template v-if="store.updateTarget.value">
      <header class="htw:flex htw:items-center htw:gap-3 htw:border-0 htw:border-b htw:border-solid htw:border-border htw:px-[22px] htw:py-[18px]">
        <PluginTile v-if="detail" :plugin="detail" :size="40" />
        <div class="htw:min-w-0 htw:flex-1">
          <h1 :id="title" class="htw:m-0 htw:text-[17px] htw:font-extrabold">
            Update {{ detail?.displayName ?? 'plugin' }}
          </h1>
          <p v-if="detail" class="htw:m-0 htw:font-mono htw:text-[12px] htw:text-muted">
            {{ detail.installed?.version }} → {{ detail.installed?.update ?? detail.latest }}
          </p>
        </div>
        <HstButton icon-only color="flat" aria-label="Close" @click="state.dismiss">
          <BuiltinIcon icon="close" :size="16" />
        </HstButton>
      </header>
      <div class="htw:flex htw:flex-col htw:gap-[18px] htw:px-[22px] htw:py-[18px]">
        <WorkbenchLoadingState v-if="loading" title="Loading update" />
        <WorkbenchErrorState v-else-if="error && !detail" title="Couldn't load update">
          {{ error }}<template #actions>
            <HstButton @click="state.load">
              Retry
            </HstButton>
          </template>
        </WorkbenchErrorState>
        <template v-else-if="detail">
          <template v-if="active">
            <p aria-live="polite" class="htw:m-0 htw:flex htw:items-center htw:gap-2">
              <HstPulsatingDisc v-if="active.status === 'running' && !active.awaiting" :size="16" />
              {{ progress }}
            </p>
            <WorkbenchErrorState v-if="store.restartError.value" title="Couldn't restart dev server">
              {{ store.restartError.value }}
            </WorkbenchErrorState>
            <HstButton v-if="active.awaiting === 'continue'" color="primary" :disabled="store.restarting.value" @click="store.restartJob(active)">
              Restart now
            </HstButton>
          </template>
          <template v-else>
            <ReleaseNotes :notes="detail.releaseNotes ?? []" />
            <div class="htw:flex htw:flex-col htw:gap-2.5" :class="hasMigrations ? 'htw:rounded-xl htw:border htw:border-solid htw:border-border htw:p-3.5' : ''">
              <HstCheckbox v-if="hasMigrations" title="Apply config migration" class="htw:m-0 htw:w-fit htw:flex-row-reverse htw:p-0" :model-value="apply" :disabled="starting" @update:model-value="apply = $event === true">
                <span class="htw:font-sans htw:font-bold">Apply config migration</span>
              </HstCheckbox>
              <p v-if="hasMigrations && !apply" role="status" class="htw:m-0 htw:rounded-lg htw:bg-accent-soft htw:p-3 htw:text-text">
                Config may need manual edits
              </p>
              <WorkbenchLoadingState v-if="planning" title="Planning update" />
              <WorkbenchErrorState v-else-if="planError" title="Couldn't plan update">
                {{ planError }}<template #actions>
                  <HstButton @click="review.replan">
                    Retry
                  </HstButton>
                </template>
              </WorkbenchErrorState>
              <template v-else-if="plan">
                <CommandBlock v-if="plan.command" :code="plan.command.display" />
                <ConfigDiff :files="plan.files" />
                <p v-for="warning in plan.warnings" :key="warning" class="htw:m-0 htw:text-[12px] htw:text-muted">
                  {{ warning }}
                </p>
              </template>
            </div>
            <p v-if="error" role="alert" class="htw:m-0 htw:text-danger-text">
              {{ error }}
            </p>
          </template>
        </template>
      </div>
      <footer class="htw:flex htw:flex-wrap htw:items-center htw:justify-end htw:gap-2 htw:border-0 htw:border-t htw:border-solid htw:border-border htw:px-[22px] htw:py-3.5">
        <HstButton v-if="detail && !active" color="flat" class="htw:me-auto" :disabled="busy" @click="state.skip">
          Skip this version
        </HstButton>
        <HstButton @click="state.dismiss">
          {{ busy ? 'Run in background' : 'Cancel' }}
        </HstButton>
        <HstButton v-if="detail && !active" color="primary" :disabled="busy || planning || !plan || store.job.value?.status === 'running'" @click="state.update">
          <HstPulsatingDisc v-if="starting" :size="12" />{{ plan?.manual ? 'Manual update' : 'Update' }}
        </HstButton>
      </footer>
    </template>
  </dialog>
</template>
