<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { useEventListener } from '@vueuse/core'
import { defineAsyncComponent } from 'vue'
import SearchLoading from '../search/SearchLoading.vue'

const LayoutPane = defineAsyncComponent({
  loader: () => import('./LayoutPane.vue'),
  loadingComponent: SearchLoading,
  delay: 0,
})

const props = defineProps({
  shown: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits({
  close: () => true,
})

function close() {
  emit('close')
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (props.shown && event.key === 'Escape') {
    close()
  }
})
</script>

<template>
  <div
    v-show="shown"
    class="histoire-layout-modal htw-fixed htw-inset-0 htw-bg-white/80 dark:htw-bg-gray-900/80 htw-z-20"
    data-test-id="layout-modal"
  >
    <div
      class="htw-absolute htw-inset-0"
      @click="close()"
    />
    <div class="htw-bg-white dark:htw-bg-gray-900 md:htw-mt-16 md:htw-mx-auto htw-w-screen htw-max-w-[512px] htw-shadow-xl htw-border htw-border-gray-200 dark:htw-border-gray-750 htw-rounded-lg htw-relative htw-divide-y htw-divide-gray-200 dark:htw-divide-gray-850">
      <div class="htw-flex htw-items-center htw-px-6 htw-py-3 htw-text-gray-900 dark:htw-text-gray-100">
        <h2 class="htw-flex-1 htw-text-sm htw-font-medium htw-m-0">
          Customize Layout
        </h2>
        <button
          type="button"
          class="htw-flex htw-items-center htw-justify-center htw-p-1 htw-bg-transparent htw-border-0 htw-text-gray-500 dark:htw-text-gray-400 hover:htw-text-primary-500 dark:hover:htw-text-primary-400 htw-cursor-pointer"
          aria-label="Close layout customization"
          data-test-id="layout-modal-close"
          @click="close()"
        >
          <Icon
            icon="carbon:close"
            class="htw-w-5 htw-h-5"
            aria-hidden="true"
          />
        </button>
      </div>
      <LayoutPane />
    </div>
  </div>
</template>
