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
  <dialog ref="dialog" class="htw:box-border htw:flex htw:flex-col htw:w-[min(640px,_calc(100vw_-_32px))] htw:max-h-[calc(100vh_-_48px)] htw:m-auto htw:p-0 htw:overflow-hidden htw:[border:1px_solid_var(--histoire-border)] htw:rounded-panel htw:text-text htw:bg-surface htw:shadow-panel htw:text-[13px] htw:[&:not([open])]:hidden htw:backdrop:bg-scrim" :aria-labelledby="`${id}-title`" @cancel.prevent="controller.close()" @close="target && controller.close()" @keydown.stop @pointerdown.stop @wheel.stop>
    <header class="htw:flex htw:items-center htw:gap-[12px] htw:p-[14px_14px_14px_20px] htw:[border-bottom:1px_solid_var(--histoire-border)]">
      <div class="htw:flex-1 htw:min-w-0">
        <h2 :id="`${id}-title`" class="htw:m-0 htw:text-[15px] htw:font-bold htw:leading-[1.3]">
          {{ title }}
        </h2>
        <span class="htw:block htw:overflow-hidden htw:text-ellipsis htw:whitespace-nowrap htw:text-muted htw:text-[12px]" :title="subtitle">{{ subtitle }}</span>
      </div>
      <HstButton color="flat" icon-only aria-label="Close" @click="controller.close()">
        <BuiltinIcon icon="close" :size="18" />
      </HstButton>
    </header>
    <div class="htw:flex htw:flex-col htw:gap-[16px] htw:min-h-0 htw:p-[20px] htw:overflow-auto">
      <WorkbenchEmptyState v-if="!story" flush class="htw:m-[4px_0]" icon="warning-alt" title="Target unavailable">
        Story or variant no longer exists
      </WorkbenchEmptyState>
      <template v-else-if="!enabled">
        <WorkbenchEmptyState flush class="htw:m-[4px_0]" icon="code" title="Embedding is disabled">
          Add <code class="htw:text-text htw:font-mono">embed</code> to your Histoire config
        </WorkbenchEmptyState>
        <div class="htw:flex htw:flex-col htw:gap-[8px]">
          <div class="htw:text-muted htw:[font:11px_var(--histoire-font-mono,_monospace)]">
            histoire.config.ts
          </div>
          <textarea ref="code" class="htw:box-border htw:block htw:w-full htw:p-[12px_14px] htw:resize-none htw:[border:1px_solid_var(--histoire-border)] htw:rounded-[10px] htw:[outline:0] htw:[color:#e6e7ea] htw:bg-code htw:[font:12px/1.6_var(--histoire-font-mono,_monospace)] htw:whitespace-pre htw:focus-visible:[box-shadow:0_0_0_2px_var(--histoire-accent)]" :value="setup" :rows="setup.split('\n').length" readonly aria-label="Config code" spellcheck="false" />
        </div>
      </template>
      <template v-else>
        <div class="htw:grid htw:[grid-template-columns:auto_1fr] htw:gap-[12px_20px] htw:items-center">
          <fieldset class="htw:contents htw:m-0 htw:p-0 htw:border-0">
            <legend class="htw:[float:none] htw:p-0 htw:text-muted htw:text-[12px] htw:font-semibold">
              Panels
            </legend>
            <div class="htw:flex htw:flex-wrap htw:gap-[6px]">
              <label v-for="panel in HISTOIRE_EMBED_PANELS" :key="panel" class="htw:inline-flex htw:items-center htw:gap-[6px] htw:p-[5px_10px] htw:[border:1px_solid_var(--histoire-border)] htw:rounded-[999px] htw:cursor-pointer htw:[&:has(:checked)]:border-accent htw:[&:has(:checked)]:bg-accent-soft htw:[&:has(:disabled)]:text-muted htw:[&:has(:disabled)]:cursor-not-allowed" :title="panelReason(panel)"><input v-model="panels" class="htw:m-0 htw:accent-accent" type="checkbox" :value="panel" :disabled="!!panelReason(panel)"><span>{{ panel[0].toUpperCase() + panel.slice(1) }}</span><small v-if="panelReason(panel)" class="htw:text-[11px]">{{ panelReason(panel) }}</small></label>
            </div>
          </fieldset>
          <div class="htw:contents">
            <label class="htw:[float:none] htw:p-0 htw:text-muted htw:text-[12px] htw:font-semibold" :for="`${id}-height`">Height</label>
            <div class="htw:flex htw:flex-wrap htw:items-center htw:gap-[10px]">
              <span class="htw:inline-flex htw:items-center htw:gap-[6px] htw:p-[0_10px_0_0] htw:[border:1px_solid_var(--histoire-border)] htw:rounded-control htw:text-muted htw:bg-input htw:[&:focus-within]:border-accent htw:[&[data-invalid]]:border-danger" :data-invalid="!validHeight || undefined"><input :id="`${id}-height`" v-model.number="height" class="htw:w-[88px] htw:p-[6px_0_6px_10px] htw:border-0 htw:[outline:0] htw:text-text htw:bg-transparent htw:tabular-nums" type="number" min="0" step="any" inputmode="decimal"><span aria-hidden="true">px</span></span>
              <span v-if="!validHeight" class="htw:m-0 htw:text-danger-text htw:text-[12px]" role="alert">Use a positive height</span>
            </div>
          </div>
        </div>
        <div class="htw:flex htw:flex-col htw:gap-[8px]">
          <div class="histoire-button-group-options htw:self-start" role="tablist" aria-label="Code format" @keydown="changeFormat">
            <HstButton v-for="item in formats" :id="`${id}-${item.value}`" :key="item.value" class="htw:flex-none htw:px-[12px]" color="flat" role="tab" :tabindex="format === item.value ? 0 : -1" :aria-selected="format === item.value" :aria-controls="`${id}-code`" @click="format = item.value">
              {{ item.label }}
            </HstButton>
          </div>
          <div :id="`${id}-code`" role="tabpanel" :aria-labelledby="`${id}-${format}`">
            <textarea ref="code" class="htw:box-border htw:block htw:w-full htw:p-[12px_14px] htw:resize-y htw:[border:1px_solid_var(--histoire-border)] htw:rounded-[10px] htw:[outline:0] htw:[color:#e6e7ea] htw:bg-code htw:[font:12px/1.6_var(--histoire-font-mono,_monospace)] htw:whitespace-pre-wrap htw:focus-visible:[box-shadow:0_0_0_2px_var(--histoire-accent)] htw:min-h-[180px] htw:max-h-[40vh] htw:break-all" :value="snippet" readonly aria-label="Embed code" spellcheck="false" />
          </div>
        </div>
        <p class="htw:flex htw:items-start htw:gap-[8px] htw:m-0 htw:text-muted htw:text-[12px]">
          <BuiltinIcon class="htw:flex-none htw:mt-[2px]" icon="information" :size="14" />
          <span>Allowed parent origins: book origin<span v-for="origin in allowedOrigins" :key="origin">, <code class="htw:font-mono">{{ origin }}</code></span>. <a class="htw:text-accent-link" href="https://histoire.dev/guide/embedding.html#origins-and-deployment-headers" target="_blank" rel="noopener noreferrer">Static hosting headers</a></span>
        </p>
      </template>
      <p v-if="copyError" class="htw:m-0 htw:text-danger-text htw:text-[12px]" role="alert">
        {{ copyError }}
      </p>
    </div>
    <footer v-if="story" class="htw:flex htw:justify-between htw:items-center htw:gap-[8px] htw:p-[12px_16px] htw:[border-top:1px_solid_var(--histoire-border)]">
      <HstButton v-if="enabled" class="htw:[&[data-color='flat']]:text-muted! htw:[&[data-color='flat']]:no-underline htw:[&[data-color='flat']]:[&:not(:disabled)]:[&:hover]:text-text!" color="flat" :disabled="!url" @click="openEmbed">
        <BuiltinIcon icon="launch" :size="14" />Open embed
      </HstButton>
      <HstButton v-else class="htw:[&[data-color='flat']]:text-muted! htw:[&[data-color='flat']]:no-underline htw:[&[data-color='flat']]:[&:not(:disabled)]:[&:hover]:text-text!" as="a" color="flat" href="https://histoire.dev/guide/embedding.html" target="_blank" rel="noopener noreferrer">
        <BuiltinIcon icon="launch" :size="14" />Embedding guide
      </HstButton>
      <HstButton class="htw:[&[data-color='primary']]:min-w-[96px]" color="primary" :disabled="!copyText || copying" @click="copy">
        <HstPulsatingDisc v-if="copying" :size="12" /><BuiltinIcon v-else :icon="copied ? 'checkmark' : 'copy'" :size="14" />{{ copied ? 'Copied' : 'Copy' }}
      </HstButton>
    </footer>
  </dialog>
</template>
