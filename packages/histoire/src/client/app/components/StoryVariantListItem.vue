<script lang="ts" setup>
import { PropType, toRefs } from 'vue'
import { useCurrentVariantRoute } from '../composable/variant'
import { Variant } from '../types'
import BaseListItemLink from './base/BaseListItemLink.vue'
import { Icon } from '@iconify/vue'

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
      v-slot="{ active }"
      :to="targetRoute"
      :is-active="isActive"
      class="htw-px-4 htw-py-2 htw-flex htw-items-center htw-gap-2"
    >
      <Icon
        :icon="variant.icon ?? 'carbon:cube'"
        class="base-list-item-link-icon htw-w-5 htw-h-5"
        :class="{
          'htw-text-zinc-500': !active,
        }"
      />
      <span>{{ variant.title }}</span>
    </BaseListItemLink>
  </div>
</template>
