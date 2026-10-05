<script setup lang="ts">
import type { HistoireSourceContent } from '@histoire/protocol'
import { HstButton, HstButtonGroup } from '@histoire/controls/vue'
import { requestHistoireOpenInEditor } from '@histoire/sdk/internal'
import { HistoireSource } from '@histoire/vue'
import { computed, nextTick, ref, shallowRef, useId, watch } from 'vue'
import { useSelection } from '../../composables/selection.js'
import { usePageOwnership } from '../pages/home/ownership.js'
import WorkbenchIcon from '../shell/WorkbenchIcon.vue'
import { findChangedSourceLine } from './state.js'

const emit = defineEmits<{ error: [error: unknown] }>()
const { session, snapshot, story, variant } = useSelection()
const ownership = usePageOwnership(session)
const drawerId = `${useId()}-source-content`
const expanded = ref(false)
const mode = ref<'raw' | 'dynamic'>('dynamic')
const content = shallowRef<HistoireSourceContent>()
const failure = ref<unknown>()
const root = ref<HTMLElement>()
const panel = ref<{ refresh: () => Promise<void> }>()
const copied = ref(false)
const loading = ref(false)
/** Source comparison survives native panel's intermediate loading publication. */
let previousBody: string | undefined
/** Metadata determines empty availability; reads remain SDK-owned. */
const available = computed(() => mode.value === 'raw' ? story.value?.content.rawSource : !!variant.value && variant.value.source?.dynamic !== false)
const dynamicReady = computed(() => mode.value === 'raw' || (snapshot.value.status === 'ready' && !snapshot.value.stale && snapshot.value.runtime.status === 'ready'))
const waitingForPreview = computed(() => mode.value === 'dynamic' && !!available.value && !dynamicReady.value)
const fileLabel = computed(() => story.value?.relativePath?.split('/').pop() || '')

// Vue compares scalar watch sources; a freshly allocated tuple would reset on every SDK publication.
watch([
  () => snapshot.value.status,
  () => snapshot.value.stale,
  () => snapshot.value.source?.sourceId,
  () => snapshot.value.source?.epoch,
  () => snapshot.value.source?.revision,
  () => snapshot.value.selection?.storyId,
  () => mode.value,
  () => mode.value === 'dynamic' ? snapshot.value.selection?.variantId : undefined,
  () => mode.value === 'dynamic' ? snapshot.value.runtime.status : undefined,
  () => mode.value === 'dynamic' ? snapshot.value.runtime.runtimeId : undefined,
], () => {
  content.value = undefined
  failure.value = undefined
  copied.value = false
  loading.value = false
  previousBody = undefined
}, { flush: 'sync' })

/** Generated source changes highlight one line; replacement selection clears comparison. */
async function receive(value: HistoireSourceContent) {
  const changed = mode.value === 'dynamic' ? findChangedSourceLine(previousBody, value.body) : -1
  previousBody = value.body
  content.value = value
  failure.value = undefined
  await nextTick()
  if (content.value !== value) return
  const lines = root.value?.querySelectorAll<HTMLElement>('.histoire-source-content .line')
  lines?.forEach((line, index) => line.toggleAttribute('data-source-changed', index === changed))
}

/** Clipboard failures stay local and observed; copied state belongs to captured content. */
async function copy() {
  const current = content.value
  const owner = ownership.capture()
  if (!current || !ownership.owns(owner)) return
  try {
    await navigator.clipboard.writeText(current.body)
    if (ownership.owns(owner) && content.value === current) {
      copied.value = true
    }
  }
  catch (error) {
    if (ownership.owns(owner) && content.value === current) {
      emit('error', error)
    }
  }
}

/** Finite dev capability opens exactly selected story, never a supplied path. */
function editor() {
  const owner = ownership.capture()
  const target = owner.selection
  if (target && ownership.owns(owner)) {
    void requestHistoireOpenInEditor(session, target).catch((error) => {
      if (ownership.owns(owner)) {
        emit('error', error)
      }
    })
  }
}

/** Preserve generation failures distinctly from metadata's unavailable content. */
function report(error: unknown) {
  if (!dynamicReady.value) {
    return
  }
  failure.value = error
  emit('error', error)
}

/** An explicit retry reuses the native panel's captured ownership controller. */
function retry() {
  failure.value = undefined
  void panel.value?.refresh()
}

/** SDK publishes status only while its source request generation remains current. */
function status(value: { status: 'idle' | 'loading' | 'ready' | 'error' }) {
  loading.value = value.status === 'loading'
  if (value.status === 'loading' || value.status === 'idle') {
    content.value = undefined
    failure.value = undefined
    copied.value = false
  }
}
</script>

<template>
  <section ref="root" class="inspector-source" :class="{ 'is-expanded': expanded }" aria-label="Source">
    <div class="inspector-source-header">
      <HstButton color="flat" type="button" class="inspector-source-toggle" :aria-expanded="expanded" :aria-controls="drawerId" @click="expanded = !expanded">
        <WorkbenchIcon name="code" />
        <strong>Source</strong>
      </HstButton>
      <HstButtonGroup v-if="expanded" v-model="mode" layout="inline" class="inspector-source-modes" aria-label="Source mode" :options="[{ value: 'dynamic', label: 'Variant' }, { value: 'raw', label: 'Story file' }]" />
      <span v-else class="inspector-source-file" :title="story?.relativePath">{{ fileLabel }}</span>
      <HstButton v-if="expanded" color="flat" type="button" class="inspector-source-action" :disabled="!content" :aria-label="copied ? 'Source copied' : 'Copy source'" :title="copied ? 'Copied' : 'Copy source'" @click="copy">
        <WorkbenchIcon :name="copied ? 'checkmark' : 'copy'" />
      </HstButton>
      <HstButton v-if="expanded && snapshot.capabilities.openInEditor.available && snapshot.source?.mode === 'dev'" color="flat" type="button" class="inspector-source-action" aria-label="Open source in editor" title="Open source in editor" @click="editor">
        <WorkbenchIcon name="launch" />
      </HstButton>
      <HstButton color="flat" type="button" class="inspector-source-action" :aria-label="expanded ? 'Collapse source' : 'Expand source'" :aria-expanded="expanded" @click="expanded = !expanded">
        <WorkbenchIcon :name="expanded ? 'chevron-down' : 'chevron-up'" :size="12" />
      </HstButton>
    </div>
    <div v-if="expanded" :id="drawerId" class="inspector-source-body">
      <p v-if="!available" class="inspector-source-empty">
        {{ mode === 'dynamic' ? 'No variant source available.' : 'No story file source available.' }}
      </p>
      <template v-else>
        <HistoireSource v-if="dynamicReady" ref="panel" :mode="mode" appearance="dark" data-test-id="story-source-code" @content="receive" @error="report" @status="status" />
        <p v-if="loading || waitingForPreview" class="inspector-source-empty" role="status">
          Loading source…
        </p>
        <p v-if="content?.body === ''" class="inspector-source-empty">
          Source is empty.
        </p>
        <HstButton v-if="failure" color="flat" type="button" class="inspector-source-retry" @click="retry">
          Retry source
        </HstButton>
      </template>
    </div>
  </section>
</template>

<style scoped>
.inspector-source { flex: none; min-height: 0; border-top: 1px solid var(--histoire-border); }
.inspector-source.is-expanded { display: flex; flex-direction: column; flex-basis: 42%; }
.inspector-source-header { display: flex; align-items: center; gap: 7px; min-height: 46px; padding: 0 12px 0 16px; }
.inspector-source-toggle { display: flex; align-items: center; gap: 9px; padding: 0; }
.inspector-source-toggle svg { color: var(--histoire-muted); }
.inspector-source-toggle strong { font-size: 12px; font-weight: 800; }
.inspector-source-file { flex: 1; overflow: hidden; text-align: right; text-overflow: ellipsis; white-space: nowrap; color: var(--histoire-muted); font: 10px var(--histoire-font-mono); }
.inspector-source-modes { display: flex; flex: 1; min-width: 0; }
.inspector-source-action { display: grid; place-items: center; width: 22px; height: 26px; padding: 0; color: var(--histoire-muted); }
.inspector-source-body { position: relative; flex: 1; min-height: 0; margin: 0 12px 12px; overflow: auto; border-radius: 10px; background: var(--histoire-code); color: #e6e7ea; }
.inspector-source-body :deep(.histoire-content-actions) { display: none; }
.inspector-source-body :deep(.histoire-source) { height: 100%; }
.inspector-source-body :deep(pre) { min-width: max-content; font: 11px/1.7 var(--histoire-font-mono); padding: 14px; background: transparent !important; }
.inspector-source-body :deep(.line) { display: inline-block; min-width: 100%; }
.inspector-source-body :deep(.line[data-source-changed]) { background: color-mix(in srgb, var(--histoire-accent) 15%, transparent); box-shadow: inset 2px 0 var(--histoire-accent); }
.inspector-source-body :deep([role="alert"]) { color: #f87171; font-size: 12px; }
.inspector-source-empty { padding: 16px; color: #b4b8c0; font-size: 12px; }
.inspector-source-retry { margin: 0 16px 16px; color: var(--histoire-text); padding: 7px 10px; }
</style>
