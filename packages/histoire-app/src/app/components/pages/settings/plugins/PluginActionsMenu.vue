<script setup lang="ts">
import type { InstalledPlugin } from './types.js'
import { HstButton } from '@histoire/controls/vue'
import { useHistoireContext } from '@histoire/vue/internal'
import { computed, nextTick, ref, watch } from 'vue'
import BasePopover from '../../../base/popover/BasePopover.vue'
import MenuItem from '../../../menu/MenuItem.vue'

const props = defineProps<{
  /** Resolved configured plugin, never remote executable code. */ plugin: InstalledPlugin
  /** Project writes are dev-only. */ dev: boolean
  /** One server job or toggle submission disables write actions. */ busy: boolean
}>()
const emit = defineEmits<{
  /** Declarative configuration editor. */ options: []
  /** Selected plugin release notes. */ changelog: []
  /** Exact installed version. */ pin: []
  /** Explicitly confirmed removal. */ remove: []
}>()
/** Panels stay inside the workbench overlay so its theme tokens and stacking apply. */
const context = useHistoireContext()
const trigger = ref<InstanceType<typeof HstButton>>()
const popover = ref<InstanceType<typeof BasePopover>>()
const anchor = computed(() => trigger.value?.element as HTMLElement | undefined)
const open = ref(false)
const confirm = ref(false)
const focusLast = ref(false)
const name = computed(() => props.plugin.displayName || props.plugin.name)
const writable = computed(() => props.dev && props.plugin.packageName && !props.plugin.local)
watch(open, () => {
  confirm.value = false
})
watch(confirm, async (value) => {
  await nextTick()
  if (!open.value) return
  // Replacing menu rows removes the focused button. Keep keyboard focus inside,
  // with Cancel selected when asking for destructive confirmation.
  const rows = popover.value?.panel?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')
  rows?.[value ? rows.length - 1 : 0]?.focus()
})

/** Arrow keys open at the corresponding enabled menu edge. */
function openMenu(event: KeyboardEvent): void {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
  event.preventDefault()
  focusLast.value = event.key === 'ArrowUp'
  open.value = true
}
/** The shared popover owns Escape; the menu owns roving focus and Tab dismissal. */
function navigate(event: KeyboardEvent): void {
  if (event.key === 'Tab') {
    open.value = false
    return
  }
  const rows = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')]
  const index = rows.indexOf(document.activeElement as HTMLElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : event.key === 'ArrowDown' ? (index + 1) % rows.length : event.key === 'ArrowUp' ? (index + rows.length - 1) % rows.length : -1
  if (next < 0) return
  event.preventDefault()
  rows[next]?.focus()
}
/** Restore focus before opening another surface or starting a project action. */
function action(value: 'options' | 'changelog' | 'pin' | 'remove'): void {
  if (value !== 'changelog' && (!writable.value || props.busy)) return
  if (value === 'remove' && (props.plugin.required || props.plugin.builtin)) return
  open.value = false
  anchor.value?.focus()
  if (value === 'options') emit('options')
  else if (value === 'changelog') emit('changelog')
  else if (value === 'pin') emit('pin')
  else emit('remove')
}
</script>

<template>
  <HstButton ref="trigger" icon-only color="flat" :aria-label="`More actions for ${name}`" aria-haspopup="menu" :aria-expanded="open" @click="open = !open" @keydown="openMenu">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="3.5" cy="8" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="12.5" cy="8" r="1.2" />
    </svg>
  </HstButton>
  <BasePopover ref="popover" v-model:open="open" :anchor="anchor ?? null" :label="`Actions for ${name}`" role="menu" :width="200" :overlay-target="context.overlay.value ?? context.root.value" class="htw:rounded-xl htw:border htw:border-solid htw:border-border htw:bg-surface htw:p-1.5 htw:shadow-panel" :focus-last="focusLast" @keydown="navigate">
    <template v-if="confirm">
      <p class="htw:m-0 htw:px-3 htw:py-2 htw:text-[13px] htw:text-body htw:font-semibold">
        Remove {{ name }}?
      </p>
      <MenuItem label="Remove" class="htw:text-danger-text" :disabled="busy ? 'Another plugin change is running' : undefined" @click="action('remove')" />
      <MenuItem label="Cancel" @click="confirm = false" />
    </template>
    <template v-else>
      <MenuItem v-if="writable" label="Options" :disabled="busy ? 'Another plugin change is running' : undefined" @click="action('options')" />
      <MenuItem v-if="plugin.packageName" label="Changelog" @click="action('changelog')" />
      <MenuItem v-if="writable" label="Pin version" :disabled="busy ? 'Another plugin change is running' : undefined" @click="action('pin')" />
      <HstButton v-if="plugin.docsUrl" as="a" role="menuitem" tabindex="-1" color="flat" class="htw:flex htw:w-full htw:justify-start" :href="plugin.docsUrl" target="_blank" rel="noopener noreferrer" :aria-label="`Documentation for ${name}`">
        Documentation
      </HstButton>
      <HstButton v-if="plugin.repoUrl" as="a" role="menuitem" tabindex="-1" color="flat" class="htw:flex htw:w-full htw:justify-start" :href="plugin.repoUrl" target="_blank" rel="noopener noreferrer" :aria-label="`Repository for ${name}`">
        Repository
      </HstButton>
      <div v-if="writable && !plugin.required && !plugin.builtin" role="separator" class="htw:my-1 htw:h-px htw:bg-border" />
      <MenuItem v-if="writable && !plugin.required && !plugin.builtin" label="Remove" class="htw:text-danger-text" :disabled="busy ? 'Another plugin change is running' : undefined" @click="confirm = true" />
    </template>
  </BasePopover>
</template>
