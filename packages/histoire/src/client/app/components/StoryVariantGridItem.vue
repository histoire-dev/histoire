<script lang="ts" setup>
import { PropType, toRefs } from 'vue'
import { useCurrentVariantRoute } from '../composable/variant'
import { Story, Variant } from '../types'
import SandboxVue3 from './sandbox/SandboxVue3.vue'

const props = defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },

  story: {
    type: Object as PropType<Story>,
    required: true,
  },
})

const { variant } = toRefs(props)
const { isActive, targetRoute } = useCurrentVariantRoute(variant)
</script>

<template>
  <RouterLink
    :to="targetRoute"
    class="htw-cursor-default htw-flex htw-flex-col htw-space-y-1"
  >
    <!-- Header -->
    <div>
      <div
        :to="targetRoute"
        class="htw-rounded htw-w-max htw-px-1.5 htw-cursor-pointer"
        :class="{
          'hover:htw-bg-gray-200 htw-text-gray-500': !isActive,
          'htw-bg-primary-200 hover:htw-bg-primary-300 htw-text-primary-800': isActive,
        }"
      >
        {{ variant.title }}
      </div>
    </div>

    <!-- Body -->
    <div
      class="htw-border htw-border-gray-100 htw-bg-white htw-rounded-lg htw-h-full htw-p-4"
      :class="{
        'htw-border-primary-200': isActive,
      }"
      @click.stop.prevent
    >
      <SandboxVue3
        :variant="variant"
        :story="story"
      />
    </div>
  </RouterLink>
</template>
