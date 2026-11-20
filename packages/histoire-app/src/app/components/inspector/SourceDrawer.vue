<script setup lang="ts">
import type { HistoireSourceContent } from '@histoire/protocol'
import { BuiltinIcon, HstButton, HstButtonGroup, useLoadingDelay } from '@histoire/controls/vue'
import { canOpenHistoireTargetInEditor, requestHistoireOpenInEditor } from '@histoire/sdk/internal'
import { HistoireSource } from '@histoire/vue'
import { computed, nextTick, ref, shallowRef, useId, watch } from 'vue'
import { isContextMenuShortcut } from '../../composables/context-menu.js'
import { useSelection } from '../../composables/selection.js'
import { useShell } from '../../composables/shell.js'
import { usePageOwnership } from '../pages/home/ownership.js'
import WorkbenchLoadingState from '../shell/WorkbenchLoadingState.vue'
import SourceAction from './SourceAction.vue'

import { findChangedSourceLine } from './state.js'

defineProps<{
  /** Docs canvas keeps its source footer on the standard surface. */
  tone?: 'surface'
}>()

const emit = defineEmits<{ error: [error: unknown], contextmenu: [event: MouseEvent | KeyboardEvent] }>()

/** Source header actions share selected story context through native menu keys. */
function onHeaderKeydown(event: KeyboardEvent): void {
  if (isContextMenuShortcut(event)) emit('contextmenu', event)
}

const { session, snapshot, story, variant } = useSelection()
const ownership = usePageOwnership(session)
const drawerId = `${useId()}-source-content`
const { sourceExpanded: expanded, toggleSource } = useShell()
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
const loadingVisible = useLoadingDelay(() => loading.value || waitingForPreview.value, () => JSON.stringify([snapshot.value.selection?.storyId, snapshot.value.selection?.variantId, mode.value]))
const fileLabel = computed(() => story.value?.relativePath?.split('/').pop() || '')
const canEdit = computed(() => canOpenHistoireTargetInEditor(snapshot.value))

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
  if (!canEdit.value) return
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
  <section ref="root" class="inspector-source htw:flex-none htw:min-h-0 htw:data-[expanded=true]:flex htw:data-[expanded=true]:flex-col htw:data-[expanded=true]:basis-[42%] htw:data-[tone=surface]:bg-surface htw:[border-top:1px_solid_var(--histoire-border)]" :data-expanded="expanded" :data-tone="tone" aria-label="Source">
    <div class="htw:flex htw:items-center htw:gap-[7px] htw:min-h-[46px]" :class="{ 'htw:px-inspector-gutter': expanded }" @contextmenu="emit('contextmenu', $event)" @keydown="onHeaderKeydown">
      <button
        type="button"
        class="htw:flex htw:min-w-0 htw:cursor-pointer htw:items-center htw:gap-[9px] htw:border-0 htw:bg-transparent htw:text-left htw:text-text htw:hover:bg-chip htw:focus-visible:bg-chip htw:focus-visible:outline-2 htw:focus-visible:-outline-offset-2"
        :class="expanded ? 'htw:-ms-pane-row-inset htw:h-control htw:rounded-control htw:px-pane-row-inset' : 'htw:w-full htw:self-stretch htw:px-inspector-gutter'"
        :aria-label="expanded ? 'Collapse source' : 'Expand source'"
        :aria-expanded="expanded"
        :aria-controls="drawerId"
        @click="toggleSource"
      >
        <BuiltinIcon class="htw:shrink-0 htw:text-muted" icon="code" :size="16" />
        <strong class="htw:text-[12px] htw:font-extrabold">Source</strong>
        <span v-if="!expanded" class="htw:min-w-0 htw:flex-1 htw:truncate htw:text-right htw:font-mono htw:text-[10px] htw:text-muted" :title="story?.relativePath">{{ fileLabel }}</span>
        <BuiltinIcon class="htw:shrink-0 htw:text-muted" :icon="expanded ? 'chevron-down' : 'chevron-up'" :size="12" />
      </button>
      <HstButtonGroup v-if="expanded" v-model="mode" layout="inline" class="htw:flex htw:flex-1 htw:min-w-0" aria-label="Source mode" :options="[{ value: 'dynamic', label: 'Variant' }, { value: 'raw', label: 'Story file' }]" />
      <SourceAction v-if="expanded" :disabled="!content" :aria-label="copied ? 'Source copied' : 'Copy source'" :title="copied ? 'Copied' : 'Copy source'" @click="copy">
        <BuiltinIcon :icon="copied ? 'checkmark' : 'copy'" :size="16" />
      </SourceAction>
      <SourceAction v-if="expanded && canEdit" aria-label="Open source in editor" title="Open source in editor" @click="editor">
        <BuiltinIcon icon="launch" :size="16" />
      </SourceAction>
    </div>
    <div v-show="expanded" :id="drawerId" class="htw:relative htw:flex-1 htw:min-h-0 htw:mt-0 htw:mx-inspector-gutter htw:mb-4 htw:overflow-auto htw:rounded-[10px] htw:bg-code htw:[color:#e6e7ea]">
      <p v-if="expanded && !available" class="htw:p-[16px] htw:[color:#b4b8c0] htw:text-[12px]">
        {{ mode === 'dynamic' ? 'No variant source available.' : 'No story file source available.' }}
      </p>
      <template v-else-if="expanded">
        <HistoireSource
          v-if="dynamicReady" ref="panel" :show-actions="false" :classes="{
            root: 'htw:h-full',
            pre: 'htw:min-w-max htw:font-mono htw:text-[11px] htw:leading-[1.7] htw:p-[14px] htw:bg-transparent! htw:[&_.line]:inline-block htw:[&_.line]:min-w-full htw:[&_.line[data-source-changed]]:bg-accent/15',
            alert: 'htw:text-danger htw:text-[12px]',
          }" :mode="mode" appearance="dark" data-test-id="story-source-code" @content="receive" @error="report" @status="status"
        />
        <div v-if="loadingVisible" class="htw:absolute htw:inset-0 htw:overflow-auto htw:bg-code htw:[--histoire-text:#e6e7ea] htw:[--histoire-muted:#b4b8c0]">
          <WorkbenchLoadingState title="Loading source…" immediate />
        </div>
        <p v-if="content?.body === ''" class="htw:p-[16px] htw:[color:#b4b8c0] htw:text-[12px]">
          Source is empty.
        </p>
        <HstButton v-if="failure" color="flat" type="button" class="inspector-source-retry htw:mt-0 htw:mx-inspector-gutter htw:mb-4 htw:text-text htw:p-[7px_10px]" @click="retry">
          Retry source
        </HstButton>
      </template>
    </div>
  </section>
</template>
