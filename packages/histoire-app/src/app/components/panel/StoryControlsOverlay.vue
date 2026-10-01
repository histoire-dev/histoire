<script lang="ts" setup>
import type { HistoireControlsOverlayMessage } from '@histoire/shared'
import { recomputeAllPoppers, Dropdown as VDropdown, Tooltip as VTooltip } from 'floating-vue'
import { computed, nextTick, ref, watch } from 'vue'

/** Host overlay anchored to a virtual reference at the sandbox control's bounds. */
const props = defineProps<{ request: HistoireControlsOverlayMessage }>()
const emit = defineEmits<{ close: [id: string, itemId?: string, restoreFocus?: boolean, focusDirection?: 'next' | 'previous'] }>()
const list = ref<HTMLElement | null>(null)
const options = computed(() => props.request.overlay?.kind === 'select' ? props.request.overlay : null)
const tooltip = computed(() => props.request.overlay?.kind === 'tooltip' ? props.request.overlay : null)

/** Tags resolution with its owning overlay so late hide events cannot close a replacement. */
function close(itemId?: string, restoreFocus = false, focusDirection?: 'next' | 'previous') {
  emit('close', props.request.id, itemId, restoreFocus, focusDirection)
}

/** Focuses the selected option only when an interactive overlay opens. */
async function focusSelected() {
  if (!options.value) return
  await nextTick()
  const selected = options.value.items.findIndex(item => item.id === options.value.selectedId)
  list.value?.querySelectorAll<HTMLButtonElement>('[role="option"]')[Math.max(0, selected)]?.focus()
}

/** Provides listbox keyboard navigation and closes before Tab leaves the overlay. */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    event.preventDefault()
    close(undefined, true, event.shiftKey ? 'previous' : 'next')
    return
  }
  const buttons = [...(list.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])]
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  let next: number
  if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
  else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = buttons.length - 1
  else return
  event.preventDefault()
  buttons[next]?.focus()
}

watch([
  () => props.request.anchor.x,
  () => props.request.anchor.y,
  () => props.request.anchor.width,
  () => props.request.anchor.height,
], async () => {
  await nextTick()
  recomputeAllPoppers()
})
</script>

<template>
  <Teleport to="body">
    <component
      :is="options ? VDropdown : VTooltip"
      :key="request.id"
      :shown="true"
      :triggers="[]"
      :auto-hide="!!options"
      :auto-size="!!options"
      :auto-boundary-max-size="!!options"
      :placement="tooltip?.placement ?? 'bottom'"
      :distance="tooltip?.distance ?? 8"
      strategy="fixed"
      class="htw-fixed htw-pointer-events-none"
      :style="{ left: `${request.anchor.x}px`, top: `${request.anchor.y}px`, width: `${request.anchor.width}px`, height: `${request.anchor.height}px` }"
      no-auto-focus
      eager-mount
      @apply-show="focusSelected"
      @hide="close()"
    >
      <div
        aria-hidden="true"
        class="htw-w-full htw-h-full"
      />
      <template #popper>
        <div
          v-if="options"
          ref="list"
          role="listbox"
          :aria-label="options.label ?? 'Options'"
          data-test-id="controls-overlay-select"
          class="htw-flex htw-flex-col htw-bg-gray-50 dark:htw-bg-gray-700"
          @keydown="onKeydown"
        >
          <button
            v-for="item in options.items"
            :key="item.id"
            type="button"
            role="option"
            :aria-selected="item.id === options.selectedId"
            class="htw-bg-transparent htw-text-left htw-px-2 htw-py-1 htw-cursor-pointer hover:htw-bg-primary-100 dark:hover:htw-bg-primary-700 focus-visible:htw-bg-primary-100 dark:focus-visible:htw-bg-primary-700 htw-outline-none"
            :class="{ 'htw-bg-primary-200 dark:htw-bg-primary-800': item.id === options.selectedId }"
            @click="close(item.id, true)"
          >
            {{ item.label }}
          </button>
        </div>
        <span v-else data-test-id="controls-overlay-tooltip">{{ tooltip?.content }}</span>
      </template>
    </component>
  </Teleport>
</template>
