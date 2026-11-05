<script setup lang="ts">
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { onMounted, ref } from 'vue'

defineProps<{
  /** Image URL. */
  src: string
  /** Visible file name. */
  name: string
  /** Download link, when the image is a stored upload. */
  href?: string
}>()
const emit = defineEmits<{
  /** Viewer dismissed. */
  close: []
}>()
const dialog = ref<HTMLDialogElement>()
// The native modal dialog provides the top layer, focus containment and Escape.
onMounted(() => {
  const element = dialog.value
  if (element?.showModal) element.showModal()
  else element?.setAttribute('open', '')
})
</script>

<template>
  <dialog ref="dialog" class="htw:flex htw:flex-col htw:[max-width:min(90vw,_1200px)] htw:[max-height:90vh] htw:p-0 htw:overflow-hidden htw:border htw:border-border htw:rounded-panel htw:bg-surface htw:text-text htw:shadow-panel htw:backdrop:bg-scrim" :aria-label="name" @close="emit('close')" @click.self="emit('close')">
    <header class="htw:flex htw:items-center htw:gap-1 htw:pt-1.5 htw:pr-1.5 htw:pb-1.5 htw:pl-3 htw:border-b htw:border-border">
      <span class="htw:flex-1 htw:min-w-0 htw:overflow-hidden htw:text-[12px] htw:font-semibold htw:text-ellipsis htw:whitespace-nowrap">{{ name }}</span>
      <a v-if="href" class="htw:inline-flex htw:p-1.5 htw:text-muted" :href="href" :download="name" aria-label="Download" title="Download"><BuiltinIcon icon="launch" :size="14" /></a>
      <HstButton icon-only color="flat" type="button" aria-label="Close" title="Close (Esc)" @click="emit('close')">
        <BuiltinIcon icon="close" :size="16" />
      </HstButton>
    </header>
    <img :src="src" :alt="name" class="htw:block htw:min-h-0 htw:max-w-full htw:[max-height:calc(90vh_-_44px)] htw:m-auto htw:object-contain htw:[background:repeating-conic-gradient(var(--histoire-chip)_0_25%,_transparent_0_50%)_0_0_/_16px_16px]">
  </dialog>
</template>
