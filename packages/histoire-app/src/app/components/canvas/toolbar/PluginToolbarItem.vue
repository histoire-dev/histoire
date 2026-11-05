<script setup lang="ts">
import type { WorkbenchHost } from '../../../extensions/create-workbench-host.js'
import type { PluginToolbarItem } from '../../../extensions/toolbar.js'
import { computed, onBeforeUnmount, ref } from 'vue'
import { pluginToolbarHint } from '../../../extensions/toolbar.js'
import { useShortcutRegistry } from '../../../util/shortcuts.js'
import ExtensionView from '../../extensions/ExtensionView.vue'
import ToolbarButton from './ToolbarButton.vue'
import ToolbarPopover from './ToolbarPopover.vue'

/** One plugin toolbar item inside its group's overflow item; inline or in the overflow menu. */
const props = defineProps<{
  /** Registered toolbar item; fixed for the component lifetime (key by contribution). */
  item: PluginToolbarItem
  /** Workbench extension host owning the item. */
  workbench: WorkbenchHost
  /** Host notification counter (registry, context, preferences, `api.invalidate`); toggles re-read `pressed` and hints when it changes. */
  revision: number
  /** Currently open toolbar panel, shared with built-in popovers. */
  open: string | null
}>()
const emit = defineEmits<{
  /** Opens or closes this item's popover. */
  'update:open': [value: string | null]
  /** Action failure, reported by the toolbar owner. */
  'error': [error: unknown]
}>()
const shortcuts = useShortcutRegistry()
const pending = ref(false)
/** Hint of the shortcut bound to the item's `command`, shown like built-in hints. */
const shortcut = computed(() => {
  void props.revision
  return pluginToolbarHint(props.workbench, shortcuts, props.item)
})
/** Bumped after an action settles: toggle state may depend on plugin state the host never notifies. */
const settled = ref(0)

const pressed = computed(() => {
  void props.revision
  void settled.value
  const { item } = props
  if (item.type !== 'toggle') return undefined
  try {
    return Boolean(item.pressed(props.workbench.context))
  }
  catch (error) {
    props.workbench.host.reportViewError(item.id, error, 'report')
    return false
  }
})

/** Runs the action once through the workbench action runner; disabled while pending. */
function run(): void {
  if (pending.value) return
  pending.value = true
  props.workbench.run(props.item.id).catch(error => emit('error', error)).finally(() => {
    pending.value = false
    settled.value++
  })
}

// A removed popover item must not leave the shared panel identity pointing at it.
onBeforeUnmount(() => {
  if (props.open === props.item.id) emit('update:open', null)
})
</script>

<template>
  <ToolbarButton v-if="item.type === 'action' || item.type === 'toggle'" :label="item.label" :icon="item.icon" :pressed="pressed" :shortcut="shortcut" :disabled="pending" :data-histoire-contribution="item.id" @click="run" />
  <ToolbarPopover v-else-if="item.type === 'popover'" :id="item.id" :open="open" :label="item.label" :icon="item.icon" :shortcut="shortcut" :data-histoire-contribution="item.id" @update:open="emit('update:open', $event)">
    <ExtensionView :contribution="item" :context="workbench.context" :host="workbench.host" />
  </ToolbarPopover>
  <ExtensionView v-else :contribution="item" :context="workbench.context" :host="workbench.host" />
</template>
