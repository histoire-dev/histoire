<script lang="ts" setup>
import { PropType, ref, toRefs } from 'vue'
import { Icon } from '@iconify/vue'
import { useRouter } from 'vue-router'
import { useResizeObserver } from '@vueuse/core'
import { useCurrentVariantRoute } from '../../util/variant'
import type { Story, Variant } from '../../types'
import SandboxVue3 from '../sandbox/SandboxVue3.vue'
import { useScrollOnActive } from '../../util/scroll.js'

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

const emit = defineEmits({
  resize: (width: number, height: number) => true,
})

const { variant } = toRefs(props)
const { isActive, targetRoute } = useCurrentVariantRoute(variant)

Object.assign(props.variant, {
  previewReady: false,
})
function onReady () {
  Object.assign(props.variant, {
    previewReady: true,
  })
}

const router = useRouter()

function selectVariant () {
  router.push(targetRoute.value)
}

const el = ref<HTMLDivElement>()

const { autoScroll } = useScrollOnActive(isActive, el)

useResizeObserver(el, () => {
  if (props.variant.previewReady) {
    emit('resize', el.value!.clientWidth, el.value!.clientHeight)
    if (isActive.value) {
      autoScroll()
    }
  }
})
</script>

<template>
  <div
    ref="el"
    class="htw-cursor-default htw-flex htw-flex-col htw-gap-y-1"
  >
    <!-- Header -->
    <div class="htw-flex-none htw-flex htw-items-center">
      <RouterLink
        :to="targetRoute"
        class="htw-rounded htw-w-max htw-px-2 htw-py-0.5 htw-min-w-16 htw-cursor-pointer htw-flex htw-items-center htw-gap-1"
        :class="{
          'hover:htw-bg-gray-200 htw-text-gray-500 dark:hover:htw-bg-gray-800': !isActive,
          'htw-bg-primary-200 hover:htw-bg-primary-300 htw-text-primary-800 dark:htw-bg-primary-700 dark:hover:htw-bg-primary-800 dark:htw-text-primary-200': isActive,
        }"
      >
        <Icon
          :icon="variant.icon ?? 'carbon:cube'"
          class="base-list-item-link-icon htw-w-4 htw-h-4 htw-opacity-50"
          :class="{
            'htw-text-gray-500': !isActive && !variant.iconColor,
            'bind-icon-color': !isActive && variant.iconColor,
          }"
        />
        <span>{{ variant.title }}</span>
      </RouterLink>
    </div>

    <!-- Body -->
    <div
      class="htw-border htw-bg-white dark:htw-bg-gray-700 htw-rounded-lg htw-flex-1 htw-p-4"
      :class="{
        'htw-border-gray-100 dark:htw-border-gray-800': !isActive,
        'htw-border-primary-200 dark:htw-border-primary-900': isActive,
      }"
      @click.stop.prevent="selectVariant()"
      @keyup="selectVariant()"
    >
      <SandboxVue3
        :variant="variant"
        :story="story"
        @ready="onReady"
      />
    </div>
  </div>
</template>

<style scoped>
.bind-icon-color {
  color: v-bind('variant.iconColor');
}
</style>
