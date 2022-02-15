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
      class="htw-flex htw-items-center htw-gap-2"
      :class="[
        $attrs.class,
        (isActive != null ? isActive : linkIsActive)
          ? 'active htw-bg-primary-500 hover:htw-bg-primary-600 htw-text-white dark:htw-text-black'
          : 'hover:htw-bg-primary-100 dark:hover:htw-bg-primary-900'
      ]"
      @click="navigate"
      @keyup.enter="navigate"
      @keyup.space="navigate"
    >
      <slot
        :active="isActive != null ? isActive : linkIsActive"
      />
    </a>
  </RouterLink>
</template>
