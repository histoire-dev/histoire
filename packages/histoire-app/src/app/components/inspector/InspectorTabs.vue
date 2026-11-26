<script setup lang="ts">
import type { InspectorTab, InspectorTabItem } from './state.js'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import BasePopover from '../base/popover/BasePopover.vue'
import { useMenuKeyboard } from '../base/use-menu-keyboard.js'
import MenuItem from '../menu/MenuItem.vue'
import { getInspectorTabId, getInspectorTabKey } from './state.js'
import { useTabOverflow } from './tab-overflow.js'

const props = defineProps<{
  /** Displayed tab value; `undefined` while a plugin tab named by the route is still loading. */
  activeTab: InspectorTab | undefined
  /** Ordered tabs; also owns keyboard navigation. */
  tabs: readonly InspectorTabItem[]
  /** Inspector-local IDs keep accessibility links within this mounted workbench. */
  idPrefix: string
}>()
const emit = defineEmits<{ select: [value: InspectorTab] }>()
const list = shallowRef<HTMLElement | null>(null)
const more = shallowRef<InstanceType<typeof HstButton> | null>(null)
const trigger = computed(() => (more.value?.element as HTMLElement | undefined) ?? null)
const open = ref(false)
const { focusLast, openMenu: triggerKey, navigate: menuKey } = useMenuKeyboard({ open, anchor: () => trigger.value })
const values = computed(() => props.tabs.map(tab => tab.value))
const { overflowed, compact } = useTabOverflow(list, () => trigger.value, () => values.value, () => props.activeTab, () => Boolean(props.tabs.find(tab => tab.value === props.activeTab)?.icon))
const menu = computed(() => props.tabs.filter(tab => overflowed.value.has(tab.value)))
watch(() => menu.value.length, (length) => {
  if (!length) open.value = false
})

// Tab to focus once it is shown: selecting an overflowed tab moves it into the row only after
// the route reports it active, which may take more than one tick.
let pendingFocus: InspectorTab | undefined

/** Focuses the pending tab when it is in the row; returns whether it did. */
function applyFocus(): boolean {
  if (pendingFocus === undefined) return false
  const tab = list.value?.ownerDocument.getElementById(`${props.idPrefix}-tab-${getInspectorTabKey(pendingFocus)}`)
  if (!tab || tab.hidden) return false
  tab.focus()
  pendingFocus = undefined
  return true
}
// The active tab changed in response to a selection: focus it, then forget the request either way.
watch(() => props.activeTab, () => {
  applyFocus()
  pendingFocus = undefined
}, { flush: 'post' })

/**
 * Selects a tab and moves focus to it.
 * @param value Tab value.
 */
function select(value: InspectorTab): void {
  pendingFocus = value
  emit('select', value)
  void nextTick(applyFocus)
}

/** Arrow/Home/End navigation moves focus and selection together, over overflowed tabs too. */
function navigate(event: KeyboardEvent) {
  const { tabs } = props
  const current = tabs.findIndex(tab => tab.value === props.activeTab)
  const index = event.key === 'ArrowRight' ? (current + 1) % tabs.length : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
  if (index < 0) return
  event.preventDefault()
  select(tabs[index].value)
}

/**
 * Picks an overflowed tab from the menu.
 * @param value Tab value.
 */
function choose(value: InspectorTab): void {
  open.value = false
  select(value)
}
</script>

<template>
  <div class="histoire-button-group-options htw:mt-0 htw:mx-inspector-gutter htw:mb-pane-gutter">
    <div ref="list" class="htw:relative htw:flex htw:flex-1 htw:gap-[3px] htw:min-w-0" role="tablist" aria-label="Inspector" @keydown="navigate">
      <HstButton v-for="tab in tabs" :id="`${idPrefix}-tab-${getInspectorTabKey(tab.value)}`" :key="tab.value" class="htw:flex htw:items-center htw:justify-center htw:gap-[5px] htw:min-w-0 htw:min-h-[32px] htw:overflow-hidden htw:text-muted htw:font-bold htw:flex-auto htw:hover:text-text htw:[[hidden]]:hidden" :class="{ 'htw:opacity-60': tab.dimmed }" color="flat" type="button" role="tab" :hidden="overflowed.has(tab.value)" :aria-selected="activeTab === tab.value" :aria-controls="`${idPrefix}-panel-${getInspectorTabKey(tab.value)}`" :tabindex="activeTab === tab.value || (activeTab === undefined && !tab.value) ? 0 : -1" :data-histoire-contribution="getInspectorTabId(tab.value)" :data-test-id="tab.value === 'tests' ? 'story-tests-tab' : undefined" @click="select(tab.value)">
        <!-- Direct-child variants leave measurement clones at natural width. The space keeps label and badge separate words in the accessible name; flex layout ignores it. -->
        <BuiltinIcon v-if="tab.icon" :icon="tab.icon" class="htw:flex-none" :size="16" />
        <span class="htw:min-w-0 htw:overflow-hidden htw:text-ellipsis htw:whitespace-nowrap htw:[[role=tablist]>[role=tab]>&]:data-[compact=true]:absolute htw:[[role=tablist]>[role=tab]>&]:data-[compact=true]:w-px htw:[[role=tablist]>[role=tab]>&]:data-[compact=true]:h-px htw:[[role=tablist]>[role=tab]>&]:data-[compact=true]:[clip-path:inset(50%)]" :data-compact="compact && activeTab === tab.value">{{ tab.label }}</span>{{ ' ' }}<component :is="tab.badge" v-if="tab.badge" />
        <span v-else-if="tab.badgeText !== undefined" class="htw:text-muted htw:text-[13px] htw:tabular-nums">{{ tab.badgeText }}</span>
      </HstButton>
    </div>
    <HstButton ref="more" class="htw:hover:text-text htw:[[hidden]]:hidden htw:[--histoire-icon-button-size:32px] htw:flex-none htw:text-muted" color="flat" type="button" icon-only aria-label="More tabs" aria-haspopup="menu" :aria-expanded="open" :hidden="!menu.length" @click="open = !open" @keydown="triggerKey">
      <BuiltinIcon icon="chevron-down" class="htw:flex-none" :size="16" />
    </HstButton>
    <BasePopover v-if="open" v-model:open="open" :anchor="trigger" label="More tabs" role="menu" :width="200" :focus-last="focusLast">
      <div class="htw:menu-rows" @keydown="menuKey">
        <MenuItem v-for="tab in menu" :key="tab.value" :label="tab.label" :icon="tab.icon" :data-histoire-contribution="getInspectorTabId(tab.value)" :class="{ 'htw:opacity-60': tab.dimmed }" @click="choose(tab.value)">
          <component :is="tab.badge" v-if="tab.badge" />
          <span v-else-if="tab.badgeText !== undefined" class="htw:text-muted htw:text-[13px] htw:tabular-nums">{{ tab.badgeText }}</span>
        </MenuItem>
      </div>
    </BasePopover>
  </div>
</template>
