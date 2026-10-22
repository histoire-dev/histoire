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
  <dialog ref="dialog" class="attachment-viewer" :aria-label="name" @close="emit('close')" @click.self="emit('close')">
    <header>
      <span class="attachment-viewer-name">{{ name }}</span>
      <a v-if="href" class="attachment-viewer-action" :href="href" :download="name" aria-label="Download" title="Download"><BuiltinIcon icon="launch" :size="14" /></a>
      <HstButton icon-only color="flat" type="button" aria-label="Close" title="Close (Esc)" @click="emit('close')">
        <BuiltinIcon icon="close" :size="16" />
      </HstButton>
    </header>
    <img :src="src" :alt="name">
  </dialog>
</template>

<style scoped>
.attachment-viewer { display: flex; flex-direction: column; max-width: min(90vw, 1200px); max-height: 90vh; padding: 0; overflow: hidden; border: 1px solid var(--histoire-border); border-radius: var(--histoire-radius-panel); background: var(--histoire-surface); color: var(--histoire-text); box-shadow: var(--histoire-shadow-panel); }
.attachment-viewer::backdrop { background: rgb(0 0 0 / 60%); }
.attachment-viewer header { display: flex; align-items: center; gap: 4px; padding: 6px 6px 6px 12px; border-bottom: 1px solid var(--histoire-border); }
.attachment-viewer-name { flex: 1; min-width: 0; overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.attachment-viewer-action { display: inline-flex; padding: 6px; color: var(--histoire-muted); }
.attachment-viewer img { display: block; min-height: 0; max-width: 100%; max-height: calc(90vh - 44px); margin: auto; object-fit: contain; background: repeating-conic-gradient(var(--histoire-chip) 0 25%, transparent 0 50%) 0 0 / 16px 16px; }
</style>
