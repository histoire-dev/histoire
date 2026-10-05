<script lang="ts" setup>
import type { HistoireControlsOverlayMessage } from '@histoire/shared'
import { focusControlsSelectedOption, moveControlsOptionFocus, reconcileControlsOptionFocus } from '@histoire/controls'
import { HstButton } from '@histoire/controls/vue'
import { recomputeAllPoppers, Dropdown as VDropdown, Tooltip as VTooltip } from 'floating-vue'
import { computed, nextTick, ref, watch } from 'vue'
import { isDark } from '../../util/dark'

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
  focusControlsSelectedOption(list.value)
}

/** Provides listbox keyboard navigation and closes before Tab leaves the overlay. */
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab' || event.key === 'Escape') {
    event.preventDefault()
    close(undefined, true, event.key === 'Tab' ? event.shiftKey ? 'previous' : 'next' : undefined)
    return
  }
  moveControlsOptionFocus(list.value, event)
}

watch(options, (value) => {
  if (!value) return
  if (!value.items.length) close(undefined, true)
  else reconcileControlsOptionFocus(list.value)
}, { deep: true, flush: 'post' })

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
          class="histoire-control-menu"
          :data-histoire-control-appearance="isDark ? 'dark' : 'light'"
          @keydown="onKeydown"
        >
          <HstButton
            v-for="item in options.items"
            :key="item.id"
            color="flat"
            :data-histoire-control-appearance="isDark ? 'dark' : 'light'"
            type="button"
            role="option"
            :aria-selected="item.id === options.selectedId"
            :disabled="item.disabled"
            @click="!item.disabled && close(item.id, true)"
          >
            {{ item.label }}
          </HstButton>
        </div>
        <span v-else class="histoire-controls-tooltip" :data-histoire-control-appearance="isDark ? 'dark' : 'light'" data-test-id="controls-overlay-tooltip">{{ tooltip?.content }}</span>
      </template>
    </component>
  </Teleport>
</template>
