<script lang="ts" setup>
import { Icon } from '@iconify/vue'
import { useResizeObserver } from '@vueuse/core'
import { computed, h, onBeforeUnmount, reactive, ref } from 'vue'

// Container

const overflowButtonWidth = 32

const el = ref<HTMLDivElement>()

const containerWidth = ref(0)

useResizeObserver(el, (entries) => {
  containerWidth.value = entries[0].contentRect.width
})

// Children

interface ChildState {
  width: number
  index: number
}

const children = ref(new Map<HTMLElement, ChildState>())

const visibleChildrenCount = computed(() => {
  const c = [...children.value.values()].sort((a, b) => a.index - b.index)
  const totalWidth = c.reduce((total, child) => total + child.width, 0)

  // The overflow button is only rendered once something actually overflows, so
  // its width must not be reserved while every child still fits: doing so hides
  // the last child even though there is room for it (and then the button it made
  // room for is what shows instead).
  if (totalWidth <= containerWidth.value) {
    return c.length
  }

  const availableWidth = containerWidth.value - overflowButtonWidth
  let width = 0
  for (let i = 0; i < c.length; i++) {
    width += c[i].width
    if (width > availableWidth) {
      return i
    }
  }
  return c.length
})

/**
 * Watches for the size of each child and automatically hide them
 */
const ChildWrapper = {
  name: 'ChildWrapper',
  props: ['index'],
  setup(props, { slots }) {
    const el = ref<HTMLDivElement>()

    const state = reactive({ width: 0, index: props.index })

    useResizeObserver(el, (entries) => {
      const width = entries[0].contentRect.width
      if (!children.value.has(el.value)) {
        children.value.set(el.value, state)
      }
      state.width = width
    })

    onBeforeUnmount(() => {
      children.value.delete(el.value)
    })

    const visible = computed(() => visibleChildrenCount.value > state.index)

    return () => h('div', { ref: el, style: { visibility: visible.value ? 'visible' : 'hidden' } }, slots.default())
  },
}

/**
 * Wraps each child with a <ChildWrapper>
 */
function ChildrenRender(props, { slots }) {
  const [fragment] = slots.default()
  return fragment.children.map((vnode, index) => h(ChildWrapper, { index }, () => [vnode]))
}

/**
 * Only renders a part of a children list
 */
function ChildrenSlice(props, { slots }) {
  const [fragment] = slots.default()
  return fragment.children.slice(props.start, props.end)
}
</script>

<template>
  <div
    ref="el"
    class="histoire-base-overflow-menu htw-flex htw-overflow-hidden htw-relative"
  >
    <ChildrenRender>
      <slot />
    </ChildrenRender>

    <VDropdown
      v-if="visibleChildrenCount < children.size"
    >
      <div
        role="button"
        class="htw-cursor-pointer hover:htw-bg-primary-50 dark:hover:htw-bg-primary-900 htw-w-8 htw-h-full htw-flex htw-items-center htw-justify-center htw-absolute htw-top-0 htw-right-0"
      >
        <Icon
          icon="carbon:caret-down"
          class="htw-w-4 htw-h-4 htw-opacity-50 group-hover:htw-opacity-100"
        />
      </div>

      <template #popper>
        <div class="htw-flex htw-flex-col htw-items-stretch">
          <ChildrenSlice
            :start="visibleChildrenCount"
          >
            <slot name="overflow" />
          </ChildrenSlice>
        </div>
      </template>
    </VDropdown>
  </div>
</template>
