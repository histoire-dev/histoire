<script lang="ts" setup>
import { PropType, ref, toRefs } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { SearchResult } from '../../types'
import { onKeyboardShortcut } from '../../util/keyboard.js'
import BaseListItemLink from '../base/BaseListItemLink.vue'
import { useScrollOnActive } from '../../util/scroll'

const props = defineProps({
  result: {
    type: Object as PropType<SearchResult>,
    required: true,
  },

  selected: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits({
  close: () => true,
})

const el = ref<HTMLDivElement>()

const { selected } = toRefs(props)
useScrollOnActive(selected, el)

const router = useRouter()

onKeyboardShortcut(['enter'], () => {
  if (!props.selected) return
  router.push(props.result.route)
  emit('close')
})

const defaultIcons = {
  story: 'carbon:cube',
  variant: 'carbon:cube',
}

const kindLabels = {
  story: 'Story',
  variant: 'Variant',
}
</script>

<template>
  <div
    ref="el"
    data-test-id="search-item"
    :data-selected="selected ? '' : undefined"
  >
    <BaseListItemLink
      :to="result.route"
      :is-active="selected"
      class="htw-px-6 htw-py-4 htw-gap-4"
      @navigate="$emit('close')"
    >
      <Icon
        :icon="result.icon ?? defaultIcons[result.kind]"
        class="htw-w-4 htw-h-4"
        :class="[
          !selected ? [
            result.iconColor
              ?'bind-icon-color'
              : {
                'htw-text-primary-500': result.kind === 'story',
                'htw-text-gray-500': result.kind === 'variant',
              }
          ] : [],
        ]"
      />
      <div class="htw-flex-1">
        <div class="htw-flex">
          {{ result.title }}
          <span class="htw-ml-auto htw-opacity-40">
            {{ kindLabels[result.kind] }}
          </span>
        </div>

        <div
          v-if="result.path?.length"
          class="htw-flex htw-items-center htw-gap-0.5 htw-opacity-60"
        >
          <div
            v-for="(p, index) of result.path"
            :key="index"
            class="htw-flex htw-items-center htw-gap-0.5"
          >
            <Icon
              v-if="index > 0"
              icon="carbon:chevron-right"
              class="htw-w-4 htw-h-4 htw-mt-0.5 htw-opacity-50"
            />
            <span>{{ p }}</span>
          </div>
        </div>
      </div>
    </BaseListItemLink>
  </div>
</template>

<style scoped>
.bind-icon-color {
  color: v-bind('result.iconColor');
}
</style>
