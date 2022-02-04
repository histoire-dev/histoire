<script lang="ts" setup>
import { PropType, toRefs } from 'vue'
import { useCurrentVariantRoute } from '../composable/variant'
import { Variant } from '../types'

const props = defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },
})

const { variant } = toRefs(props)
const { isActive, targetRoute } = useCurrentVariantRoute(variant)
</script>

<template>
  <div>
    <RouterLink
      :to="targetRoute"
      class="htw-p-2 htw-flex htw-space-x-2 hover:htw-bg-primary-100 dark:hover:htw-bg-primary-900"
      active-class="htw-bg-primary-500 dark:htw-bg-primary-600 htw-text-white htw-font-bold"
    >
      {{ variant.title }}
    </RouterLink>
  </div>
</template>
