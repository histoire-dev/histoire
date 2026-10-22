<script setup lang="ts">
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'

defineProps<{
  /** File name; image tiles show it as a tooltip only. */
  name: string
  /** Thumbnail URL; makes this an image tile that opens the viewer. */
  src?: string
  /** Type and size line of a file card. */
  meta?: string
  /** Download link of a file card. */
  href?: string
  /** Shows a remove button. */
  removable?: boolean
}>()
const emit = defineEmits<{
  /** Open the image viewer. */
  open: []
  /** Detach the file from the message. */
  remove: []
}>()
</script>

<template>
  <div class="attachment-tile" :class="{ image: src }" :title="name">
    <button v-if="src" type="button" class="attachment-thumb" :aria-label="`Open ${name}`" @click="emit('open')">
      <img :src="src" alt="">
    </button>
    <template v-else>
      <span class="attachment-icon"><BuiltinIcon icon="document" :size="16" /></span>
      <span class="attachment-text">
        <a v-if="href" class="attachment-name" :href="href" :download="name">{{ name }}</a>
        <span v-else class="attachment-name">{{ name }}</span>
        <span v-if="meta" class="attachment-meta">{{ meta }}</span>
      </span>
    </template>
    <HstButton v-if="removable" icon-only color="flat" type="button" class="attachment-remove" :aria-label="`Remove ${name}`" :title="`Remove ${name}`" @click="emit('remove')">
      <BuiltinIcon icon="close" :size="12" />
    </HstButton>
  </div>
</template>

<style scoped>
.attachment-tile { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 48px; max-width: 220px; padding: 0 28px 0 6px; border: 1px solid var(--histoire-border); border-radius: var(--histoire-radius-control); background: var(--histoire-chip); font-size: 12px; }
.attachment-tile.image { width: 48px; padding: 0; overflow: hidden; }
.attachment-thumb { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: var(--histoire-surface); cursor: zoom-in; }
.attachment-thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.attachment-thumb:focus-visible { outline: 2px solid var(--histoire-agent); outline-offset: -2px; }
.attachment-icon { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: var(--histoire-radius-control); background: var(--histoire-surface); color: var(--histoire-muted); }
.attachment-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
.attachment-name { overflow: hidden; color: inherit; font-weight: 600; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
a.attachment-name:hover { text-decoration: underline; }
.attachment-meta { color: var(--histoire-muted); font-size: 11px; }
/* Remove sits in the top corner; on image tiles it shows on hover or keyboard focus. */
.attachment-remove { --histoire-icon-button-size: 18px; position: absolute; top: 3px; right: 3px; border-radius: 999px; background: var(--histoire-surface); color: var(--histoire-muted); box-shadow: 0 0 0 1px var(--histoire-border); }
/* Over an image the button needs its own dark backing to stay readable on any picture. */
.attachment-tile.image .attachment-remove { opacity: 0; background: rgb(0 0 0 / 70%); color: #fff; box-shadow: 0 0 0 1px rgb(255 255 255 / 25%); transition: opacity 120ms ease, background-color 120ms ease; }
.attachment-tile.image .attachment-remove:hover { background: rgb(0 0 0 / 90%); }
.attachment-tile.image:hover .attachment-remove, .attachment-tile.image:focus-within .attachment-remove { opacity: 1; }
</style>
