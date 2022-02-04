<script lang="ts" setup>
import { PropType, toRefs } from 'vue'
import { useCurrentVariantRoute } from '../composable/variant'
import { Variant } from '../types'
import BaseListItemLink from './base/BaseListItemLink.vue'

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
    <BaseListItemLink
      :to="targetRoute"
      :is-active="isActive"
    >
      {{ variant.title }}
    </BaseListItemLink>
  </div>
</template>
