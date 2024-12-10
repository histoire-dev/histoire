<script lang="ts" setup>
import type { PropType } from 'vue'
import type { Variant } from '../../types'
import { Icon } from '@iconify/vue'
import { ref, toRefs } from 'vue'
import { useScrollOnActive } from '../../util/scroll'
import { useCurrentVariantRoute } from '../../util/variant'
import BaseListItemLink from '../base/BaseListItemLink.vue'

const props = defineProps({
  variant: {
    type: Object as PropType<Variant>,
    required: true,
  },
})

const { variant } = toRefs(props)
const { isActive, targetRoute } = useCurrentVariantRoute(variant)
const el = ref<HTMLDivElement>()
useScrollOnActive(isActive, el)
</script>

<template>
  <div
    ref="el"
    class="histoire-story-variant-list-item"
    data-test-id="story-variant-list-item"
  >
    <BaseListItemLink
      v-slot="{ active }"
      :to="targetRoute"
      :is-active="isActive"
      class="htw-px-2 htw-py-2 md:htw-py-1.5 htw-m-1 htw-rounded-sm htw-flex htw-items-center htw-gap-2"
    >
      <Icon
        :icon="variant.icon ?? 'carbon:cube'"
        class="htw-w-5 htw-h-5 sm:htw-w-4 sm:htw-h-4 htw-flex-none"
        :class="{
          'htw-text-gray-500': !active && !variant.iconColor,
          'bind-icon-color': !active && variant.iconColor,
        }"
      />
      <span class="htw-truncate">{{ variant.title }}</span>
    </BaseListItemLink>
  </div>
</template>

<style scoped>
.bind-icon-color {
  color: v-bind('variant.iconColor');
}
</style>
