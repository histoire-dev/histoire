import type { HistoireEmbedPanel } from '@histoire/protocol'
import { getEmbedRelativeUrl, validateEmbedPanels } from '@histoire/protocol'

/** Formats offered by the shared embed dialog. */
export type EmbedSnippetFormat = 'iframe' | 'javascript' | 'vue'

/** Captured target and user-selected presentation, never runtime state. */
export interface EmbedSnippetOptions {
  /** Absolute source base, independent of current workbench URL. */
  bookUrl: string
  /** Exact captured story ID. */
  storyId: string
  /** Exact variant ID; omission embeds story switcher. */
  variantId?: string
  /** Accessible iframe name. */
  title: string
  /** Enabled optional panels. */
  panels: readonly HistoireEmbedPanel[]
  /** Positive finite outer height in CSS pixels. */
  height: number
}

/** Escape attributes for HTML/Vue output, without changing actual target values. */
function attribute(value: string): string {
  return value.replace(/[&"<>]/g, character => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[character]!)
}

/** Safe JavaScript literal inside a module script or Vue SFC. */
function literal(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

/** Validate outer layout and canonical source base for every output format. */
function base(options: EmbedSnippetOptions): URL {
  if (!Number.isFinite(options.height) || options.height <= 0) throw new Error('Use a positive height')
  const url = new URL(options.bookUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/')) throw new Error('Expected HTTP(S) book base URL')
  return url
}

/** Copyable direct URL contains presentation and exact target only. */
export function createEmbedUrl(options: EmbedSnippetOptions): string {
  const url = base(options)
  return new URL(getEmbedRelativeUrl({ base: url.pathname, storyId: options.storyId, variantId: options.variantId, panels: options.panels }), url).href
}

/** Generate executable consumer code from one model; cleanup remains explicitly callable. */
export function createEmbedSnippet(format: EmbedSnippetFormat, options: EmbedSnippetOptions): string {
  const url = createEmbedUrl(options)
  const panels = validateEmbedPanels(options.panels)
  const target = literal({ storyId: options.storyId, ...(options.variantId === undefined ? {} : { variantId: options.variantId }) })
  const scope = options.variantId === undefined ? 'story' : 'variant'
  if (format === 'iframe') return `<iframe\n  src="${attribute(url)}"\n  title="${attribute(options.title)}"\n  loading="lazy"\n  style="width:100%;height:${options.height}px;border:0"\n></iframe>`
  if (format === 'javascript') {
    return `<div id="histoire-embed" style="width:100%;height:${options.height}px"></div>
<script type="module">
import { createHistoireSession } from '@histoire/sdk'

const session = createHistoireSession({ url: ${literal(options.bookUrl)} })
let embed
try {
  await session.connect()
  await session.selection.select(${target})
  embed = session.mount(document.querySelector('#histoire-embed'), {
    surface: 'explorer',
    presentation: { type: 'embed', scope: '${scope}', panels: ${literal(panels)} },
  })
  await embed.ready
}
catch (error) {
  await session.dispose()
  throw error
}

// Call when removing this view.
async function disposeEmbed() {
  try {
    await embed?.unmount()
  }
  finally {
    await session.dispose()
  }
}
</script>`
  }
  return `<script setup>
import { createHistoireSession } from '@histoire/sdk'
import { HistoireEmbed, HistoireProvider } from '@histoire/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import '@histoire/vue/style.css'

const session = createHistoireSession({ url: ${literal(options.bookUrl)} })
const ready = ref(false)
const error = ref('')
let active = true

onMounted(async () => {
  try {
    await session.connect()
    if (!active) return
    await session.selection.select(${target})
    if (active) ready.value = true
  }
  catch (failure) {
    if (active) error.value = 'Embed failed to load'
  }
})
onBeforeUnmount(() => {
  active = false
  void session.dispose().catch(() => {})
})

function reportError() {
  if (active) error.value = 'Embed failed to load'
}
</script>

<template>
  <HistoireProvider v-if="ready" :session="session" style="width:100%;height:${options.height}px" @error="reportError">
    <HistoireEmbed scope="${scope}" :panels="${attribute(literal(panels))}" @error="reportError" />
  </HistoireProvider>
  <p v-if="error" role="alert">{{ error }}</p>
</template>`
}
