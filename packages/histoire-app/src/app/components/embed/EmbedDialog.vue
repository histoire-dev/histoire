<script setup lang="ts">
import type { HistoireEmbedPanel } from '@histoire/protocol'
import type { EmbedController } from './controller.js'
import type { EmbedSnippetFormat } from './snippets.js'
import { BuiltinIcon, HstButton, HstPulsatingDisc } from '@histoire/controls/vue'
import { HISTOIRE_EMBED_PANELS } from '@histoire/protocol'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import WorkbenchEmptyState from '../shell/WorkbenchEmptyState.vue'
import { createEmbedSnippet, createEmbedUrl } from './snippets.js'

const props = defineProps<{
  /** Owner-scoped immutable dialog identity. */
  controller: EmbedController
  /** Canonical book base; current workbench routes never enter snippets. */
  bookUrl: string
  /** Public embedding remains explicitly enabled in project configuration. */
  enabled: boolean
  /** Configured additional exact parent origins. */
  allowedOrigins: readonly string[]
}>()
const dialog = ref<HTMLDialogElement>()
const code = ref<HTMLTextAreaElement>()
const panels = ref<HistoireEmbedPanel[]>(['controls'])
const height = ref(600)
const format = ref<EmbedSnippetFormat>('iframe')
const copied = ref(false)
const copying = ref(false)
const copyError = ref('')
const id = useId()
const formats: { value: EmbedSnippetFormat, label: string }[] = [{ value: 'iframe', label: 'Iframe' }, { value: 'javascript', label: 'JavaScript' }, { value: 'vue', label: 'Vue' }]
let active = true
let generation = 0
const target = props.controller.target
const story = props.controller.story
const title = computed(() => target.value?.variantId === undefined ? 'Embed this story' : 'Embed this variant')
const label = computed(() => target.value?.variantId === undefined ? story.value?.title : story.value?.variants.find(variant => variant.id === target.value?.variantId)?.title)
/** Variant targets keep their parent story visible for context. */
const subtitle = computed(() => target.value?.variantId === undefined ? label.value : [story.value?.title, label.value].filter(Boolean).join(' › '))
const validHeight = computed(() => Number.isFinite(height.value) && height.value > 0)

/** Unsupported panels explain unavailable source content without broadening output. */
function panelReason(panel: HistoireEmbedPanel): string | undefined {
  if (panel === 'docs' && (!story.value?.content.docs || !props.controller.snapshot.value.capabilities.docs.available)) return 'No docs available'
  if (panel === 'source' && (!story.value?.content.rawSource || !props.controller.snapshot.value.capabilities.rawSource.available)) return 'No source available'
}
const options = computed(() => target.value && story.value && validHeight.value
  ? {
      bookUrl: props.bookUrl,
      storyId: target.value.storyId,
      variantId: target.value.variantId,
      title: `${story.value.title}${target.value.variantId === undefined ? '' : ` — ${label.value}`}`,
      panels: panels.value.filter(panel => !panelReason(panel)),
      height: height.value,
    }
  : undefined)
const snippet = computed(() => props.enabled && options.value ? createEmbedSnippet(format.value, options.value) : '')
const url = computed(() => props.enabled && options.value ? createEmbedUrl(options.value) : '')
const setup = `export default defineConfig({\n  embed: {\n    enabled: true,\n    allowedOrigins: ['https://app.example.com'],\n  },\n})`
/** Disabled embedding offers config setup instead of an embed snippet. */
const copyText = computed(() => props.enabled ? snippet.value : setup)

watch(target, async (value) => {
  generation++
  if (!value) {
    dialog.value?.close()
    return
  }
  panels.value = ['controls']
  height.value = 600
  format.value = 'iframe'
  copied.value = false
  copyError.value = ''
  const current = generation
  await nextTick()
  if (active && generation === current && target.value && !dialog.value?.open) dialog.value?.showModal()
}, { immediate: true })
watch([snippet, props.controller.generation], () => {
  generation++
  copied.value = false
  copying.value = false
  copyError.value = ''
}, { flush: 'sync' })
onBeforeUnmount(() => {
  active = false
  generation++
  dialog.value?.close()
})

/** Completion belongs to exact code and dialog generation captured before clipboard work. */
async function copy(): Promise<void> {
  if (!copyText.value) return
  const current = generation
  const text = copyText.value
  copying.value = true
  try {
    await navigator.clipboard.writeText(text)
    if (active && current === generation) copied.value = true
  }
  catch {
    if (active && current === generation) {
      copyError.value = 'Could not copy. Select code and copy manually.'
      code.value?.focus()
      code.value?.select()
    }
  }
  finally {
    if (active && current === generation) copying.value = false
  }
}

/** Browser click remains explicit; window features prevent access to opener. */
function openEmbed(): void {
  if (url.value) window.open(url.value, '_blank', 'noopener,noreferrer')
}

/** Arrow navigation follows standard tab semantics and keeps one tab stop. */
function changeFormat(event: KeyboardEvent): void {
  const current = formats.findIndex(item => item.value === format.value)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? formats.length - 1 : event.key === 'ArrowRight' ? (current + 1) % formats.length : event.key === 'ArrowLeft' ? (current + formats.length - 1) % formats.length : -1
  if (index < 0) return
  event.preventDefault()
  format.value = formats[index].value
  void nextTick(() => dialog.value?.querySelector<HTMLElement>(`[id="${id}-${format.value}"]`)?.focus())
}
</script>

<template>
  <dialog ref="dialog" class="histoire-embed-dialog" :aria-labelledby="`${id}-title`" @cancel.prevent="controller.close()" @close="target && controller.close()" @keydown.stop @pointerdown.stop @wheel.stop>
    <header class="embed-header">
      <div class="embed-heading">
        <h2 :id="`${id}-title`">
          {{ title }}
        </h2>
        <span :title="subtitle">{{ subtitle }}</span>
      </div>
      <HstButton color="flat" icon-only aria-label="Close" @click="controller.close()">
        <BuiltinIcon icon="close" :size="18" />
      </HstButton>
    </header>
    <div class="embed-body">
      <WorkbenchEmptyState v-if="!story" class="embed-state" icon="warning-alt" title="Target unavailable">
        Story or variant no longer exists
      </WorkbenchEmptyState>
      <template v-else-if="!enabled">
        <WorkbenchEmptyState class="embed-state" icon="code" title="Embedding is disabled">
          Add <code>embed</code> to your Histoire config
        </WorkbenchEmptyState>
        <div class="embed-code-block">
          <div class="embed-code-label">
            histoire.config.ts
          </div>
          <textarea ref="code" class="embed-code" :value="setup" :rows="setup.split('\n').length" readonly aria-label="Config code" spellcheck="false" />
        </div>
      </template>
      <template v-else>
        <div class="embed-options">
          <fieldset class="embed-field">
            <legend>Panels</legend>
            <div class="embed-panels">
              <label v-for="panel in HISTOIRE_EMBED_PANELS" :key="panel" :title="panelReason(panel)"><input v-model="panels" type="checkbox" :value="panel" :disabled="!!panelReason(panel)"><span>{{ panel[0].toUpperCase() + panel.slice(1) }}</span><small v-if="panelReason(panel)">{{ panelReason(panel) }}</small></label>
            </div>
          </fieldset>
          <div class="embed-field">
            <label :for="`${id}-height`">Height</label>
            <div class="embed-height">
              <span class="embed-input" :data-invalid="!validHeight || undefined"><input :id="`${id}-height`" v-model.number="height" type="number" min="0" step="any" inputmode="decimal"><span aria-hidden="true">px</span></span>
              <span v-if="!validHeight" class="embed-error" role="alert">Use a positive height</span>
            </div>
          </div>
        </div>
        <div class="embed-code-block">
          <div class="embed-formats histoire-button-group-options" role="tablist" aria-label="Code format" @keydown="changeFormat">
            <HstButton v-for="item in formats" :id="`${id}-${item.value}`" :key="item.value" color="flat" role="tab" :tabindex="format === item.value ? 0 : -1" :aria-selected="format === item.value" :aria-controls="`${id}-code`" @click="format = item.value">
              {{ item.label }}
            </HstButton>
          </div>
          <div :id="`${id}-code`" role="tabpanel" :aria-labelledby="`${id}-${format}`">
            <textarea ref="code" class="embed-code embed-code-snippet" :value="snippet" readonly aria-label="Embed code" spellcheck="false" />
          </div>
        </div>
        <p class="embed-policy">
          <BuiltinIcon icon="information" :size="14" />
          <span>Allowed parent origins: book origin<span v-for="origin in allowedOrigins" :key="origin">, <code>{{ origin }}</code></span>. <a href="https://histoire.dev/guide/embedding.html#origins-and-deployment-headers" target="_blank" rel="noopener noreferrer">Static hosting headers</a></span>
        </p>
      </template>
      <p v-if="copyError" class="embed-error" role="alert">
        {{ copyError }}
      </p>
    </div>
    <footer v-if="story" class="embed-footer">
      <HstButton v-if="enabled" color="flat" :disabled="!url" @click="openEmbed">
        <BuiltinIcon icon="launch" :size="14" />Open embed
      </HstButton>
      <HstButton v-else as="a" color="flat" href="https://histoire.dev/guide/embedding.html" target="_blank" rel="noopener noreferrer">
        <BuiltinIcon icon="launch" :size="14" />Embedding guide
      </HstButton>
      <HstButton color="primary" :disabled="!copyText || copying" @click="copy">
        <HstPulsatingDisc v-if="copying" :size="12" /><BuiltinIcon v-else :icon="copied ? 'checkmark' : 'copy'" :size="14" />{{ copied ? 'Copied' : 'Copy' }}
      </HstButton>
    </footer>
  </dialog>
</template>

<style scoped>
.histoire-embed-dialog { box-sizing: border-box; display: flex; flex-direction: column; width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 48px); margin: auto; padding: 0; overflow: hidden; border: 1px solid var(--histoire-border); border-radius: var(--histoire-radius-panel, 16px); color: var(--histoire-text); background: var(--histoire-surface); box-shadow: var(--histoire-shadow-panel); font-size: 13px; }
.histoire-embed-dialog:not([open]) { display: none; }
.histoire-embed-dialog::backdrop { background: rgb(0 0 0 / .45); }
.embed-header { display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 20px; border-bottom: 1px solid var(--histoire-border); }
.embed-heading { flex: 1; min-width: 0; }
.embed-heading h2 { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.3; }
.embed-heading span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--histoire-muted); font-size: 12px; }
.embed-body { display: flex; flex-direction: column; gap: 16px; min-height: 0; padding: 20px; overflow: auto; }
.embed-state { margin: 4px 0; }
.embed-state code { color: var(--histoire-text); font-family: var(--histoire-font-mono, monospace); }
.embed-options { display: grid; grid-template-columns: auto 1fr; gap: 12px 20px; align-items: center; }
.embed-field { display: contents; }
fieldset.embed-field { margin: 0; padding: 0; border: 0; }
.embed-field > :is(legend, label) { float: none; padding: 0; color: var(--histoire-muted); font-size: 12px; font-weight: 600; }
.embed-panels { display: flex; flex-wrap: wrap; gap: 6px; }
.embed-panels label { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px; border: 1px solid var(--histoire-border); border-radius: 999px; cursor: pointer; }
.embed-panels label:has(:checked) { border-color: var(--histoire-accent); background: var(--histoire-accent-soft); }
.embed-panels label:has(:disabled) { color: var(--histoire-muted); cursor: not-allowed; }
.embed-panels input { margin: 0; accent-color: var(--histoire-accent); }
.embed-panels small { font-size: 11px; }
.embed-height { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.embed-input { display: inline-flex; align-items: center; gap: 6px; padding: 0 10px 0 0; border: 1px solid var(--histoire-border); border-radius: var(--histoire-radius-control, 7px); color: var(--histoire-muted); background: var(--histoire-input); }
.embed-input:focus-within { border-color: var(--histoire-accent); }
.embed-input[data-invalid] { border-color: var(--histoire-danger); }
.embed-input input { width: 88px; padding: 6px 0 6px 10px; border: 0; outline: 0; color: var(--histoire-text); background: transparent; font-variant-numeric: tabular-nums; }
.embed-error { margin: 0; color: var(--histoire-danger-text); font-size: 12px; }
.embed-code-block { display: flex; flex-direction: column; gap: 8px; }
.embed-formats { align-self: flex-start; }
.embed-formats .histoire-button { flex: none; padding-inline: 12px; }
.embed-code-label { color: var(--histoire-muted); font: 11px var(--histoire-font-mono, monospace); }
.embed-code { box-sizing: border-box; display: block; width: 100%; padding: 12px 14px; resize: none; border: 1px solid var(--histoire-border); border-radius: 10px; outline: 0; color: #e6e7ea; background: var(--histoire-code); font: 12px/1.6 var(--histoire-font-mono, monospace); white-space: pre; }
.embed-code:focus-visible { box-shadow: 0 0 0 2px var(--histoire-accent); }
.embed-code-snippet { min-height: 180px; max-height: 40vh; resize: vertical; white-space: pre-wrap; word-break: break-all; }
.embed-policy { display: flex; align-items: flex-start; gap: 8px; margin: 0; color: var(--histoire-muted); font-size: 12px; }
.embed-policy svg { flex: none; margin-top: 2px; }
.embed-policy code { font-family: var(--histoire-font-mono, monospace); }
.embed-policy a { color: var(--histoire-accent-link); }
.embed-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--histoire-border); }
.embed-footer .histoire-button[data-color="flat"] { color: var(--histoire-muted); text-decoration: none; }
.embed-footer .histoire-button[data-color="flat"]:not(:disabled):hover { color: var(--histoire-text); }
.embed-footer .histoire-button[data-color="primary"] { min-width: 96px; }
</style>
