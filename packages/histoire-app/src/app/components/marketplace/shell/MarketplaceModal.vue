<script setup lang="ts">
import { provideHistoireControls, useHistoireControls } from '@histoire/controls/vue'
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { useMarketplaceStore } from '../../../stores/marketplace.js'
import MarketplaceHeader from './MarketplaceHeader.vue'
import MarketplaceView from './MarketplaceView.vue'
import { useMarketplaceKeys } from './use-marketplace-keys.js'

const store = useMarketplaceStore()
/** Share the native top-layer element without passing it through detail views. */
const dialog = store.overlayTarget
const controls = useHistoireControls()
// Selects must teleport into the native top layer while inheriting the host theme.
provideHistoireControls({ overlay: dialog, dark: controls?.dark ?? ref(false) })
const header = ref<InstanceType<typeof MarketplaceHeader>>()
const id = useId()
const keys = useMarketplaceKeys(store, () => header.value?.focusSearch())
/** Run after DOM updates so only the latest open state reaches the native top layer. */
function synchronize(): void {
  if (store.open.value && !dialog.value?.open) {
    dialog.value?.showModal()
    header.value?.focusSearch()
  }
  else if (!store.open.value && dialog.value?.open) {
    dialog.value.close()
  }
}
watch(store.open, synchronize, {
  flush: 'post',
})
onMounted(() => {
  store.connect()
  synchronize()
})
onBeforeUnmount(() => {
  store.close()
  dialog.value?.close()
  store.dispose()
})
</script>

<template>
  <dialog ref="dialog" role="dialog" aria-modal="true" :aria-labelledby="`${id}-title`" class="htw:fixed htw:inset-[12px] htw:m-0 htw:box-border htw:flex htw:h-[calc(100dvh_-_24px)] htw:max-h-none htw:w-[calc(100vw_-_24px)] htw:max-w-none htw:flex-col htw:overflow-hidden htw:rounded-[16px] htw:border htw:border-solid htw:border-border htw:bg-canvas htw:p-0 htw:font-sans htw:text-[13px] htw:leading-[1.45] htw:text-text htw:antialiased htw:shadow-panel htw:[&:not([open])]:hidden htw:backdrop:bg-scrim" @cancel.prevent="store.close" @close="!dialog?.open && store.open.value && store.close()" @keydown.stop="keys" @pointerdown.stop @wheel.stop>
    <MarketplaceHeader ref="header" :title-id="`${id}-title`" />
    <div v-if="store.open.value" class="htw:flex htw:min-h-0 htw:flex-1 htw:flex-col htw:overflow-hidden htw:bg-canvas">
      <MarketplaceView />
    </div>
  </dialog>
</template>
