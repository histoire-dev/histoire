<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import { defineEmits } from '@vue/runtime-core'

const props = defineProps<{
  isOpened: boolean
}>()

const emits = defineEmits<{(e: 'close'): void}>()
</script>

<template>
  <transition name="__histoire-fade">
    <div
      v-if="isOpened"
      class="htw-absolute htw-z-10 htw-bg-white dark:htw-bg-gray-700 htw-w-screen htw-h-screen htw-inset-0 htw-overflow-y-hidden htw-flex htw-flex-col"
    >
      <div class="htw-p-4 htw-h-16 htw-flex htw-border-b htw-border-gray-100 dark:htw-border-gray-800 htw-items-center htw-justify-end">
        <a
          class="htw-p-1 hover:htw-text-primary-500 dark:hover:htw-text-primary-400 htw-cursor-pointer"
          @click="emits('close')"
        >
          <Icon
            icon="carbon:close"
            class="htw-w-8 htw-h-8 htw-shrink-0"
          />
        </a>
      </div>
      <slot />
    </div>
  </transition>
</template>
