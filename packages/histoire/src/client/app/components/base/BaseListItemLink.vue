<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  inheritAttrs: false,

  props: {
    isActive: {
      type: Boolean,
      default: undefined,
    },
  },
})
</script>

<template>
  <RouterLink
    v-slot="{ isActive: linkIsActive, href, navigate }"
    v-bind="$attrs"
    custom
  >
    <a
      :href="href"
      class="htw-px-4 htw-py-2 htw-flex htw-items-center htw-space-x-2"
      :class="[
        (isActive != null ? isActive : linkIsActive)
          ? 'htw-bg-primary-500 hover:htw-bg-primary-600 htw-text-black'
          : 'hover:htw-bg-primary-100 dark:hover:htw-bg-primary-900'
      ]"
      @click="navigate"
    >
      <slot />
    </a>
  </RouterLink>
</template>
