<script setup lang="ts">
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'

/** Review controls load only when the update dialog opens. */
const MarketplaceUpdateBody = defineAsyncComponent(() => import('./MarketplaceUpdateBody.vue'))
const store = useMarketplaceStore()
const dialog = ref<HTMLDialogElement>()
const title = useId()
let opener: HTMLElement | undefined
/** Close the selected update visit without cancelling server-owned work. */
function dismiss(): void {
  store.updateTarget.value = undefined
}
/** Preserve native top-layer focus ownership across asynchronously loaded body visits. */
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
  <dialog ref="dialog" role="dialog" aria-modal="true" :aria-labelledby="title" class="htw:fixed htw:inset-0 htw:m-auto htw:box-border htw:max-h-[calc(100dvh_-_32px)] htw:w-[min(620px,calc(100vw_-_32px))] htw:overflow-auto htw:rounded-2xl htw:border-0 htw:bg-surface htw:p-0 htw:text-text htw:text-[13px] htw:shadow-panel htw:[&:not([open])]:hidden htw:backdrop:bg-scrim" @cancel.prevent="dismiss" @close="!dialog?.open && store.updateTarget.value && dismiss()" @keydown.esc.stop.prevent="dismiss" @keydown.stop @pointerdown.stop @wheel.stop>
    <MarketplaceUpdateBody v-if="store.updateTarget.value" :title="title" />
  </dialog>
</template>
