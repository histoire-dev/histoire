<script setup lang="ts">
import type { HistoireDocsContent, HistoireSelectionInput, HistoireTarget } from '@histoire/protocol'
import { HstButton } from '@histoire/controls/vue'
import { requestHistoireOpenInEditor } from '@histoire/sdk/internal'
import { HistoireDocs, useHistoireSession, useHistoireSnapshot } from '@histoire/vue'
import { computed, nextTick, ref, watch } from 'vue'
import WorkbenchIcon from '../../shell/WorkbenchIcon.vue'
import { usePageOwnership } from '../home/ownership.js'
import MarkdownOutline from './MarkdownOutline.vue'
import MarkdownPager from './MarkdownPager.vue'
import { documentNeighbors } from './navigation.js'
import { useMarkdownOutline } from './outline.js'
import './markdown.css'

const props = withDefaults(defineProps<{
  /** Existing standalone route/search documentation anchor. */
  anchor?: string
}>(), { anchor: '' })
const emit = defineEmits<{
  /** Successful guide selection; SDK facade keeps URL ownership. */
  select: [target: HistoireTarget]
  /** Content, selection, editor or clipboard failure. */
  error: [error: unknown]
}>()
const session = useHistoireSession()
const ownership = usePageOwnership(session)
const snapshot = useHistoireSnapshot()
const root = ref<HTMLElement | null>(null)
const outline = useMarkdownOutline(root)
const story = computed(() => snapshot.value.catalog.stories.find(story => story.id === snapshot.value.selection?.storyId))
const pager = computed(() => documentNeighbors(snapshot.value.catalog, story.value))
const path = ref<string>()
const titleInContent = ref(false)
const loaded = ref(false)
const empty = ref(false)
const copied = ref(false)
const currentAnchor = ref(props.anchor)
const canEdit = computed(() => __HISTOIRE_DEV__ && snapshot.value.source?.mode === 'dev' && snapshot.value.capabilities.openInEditor.available)
watch(() => props.anchor, value => currentAnchor.value = value)

/** Preserve rendered IDs while avoiding double encoding copied local anchors. */
function encodedAnchor(anchor: string): string {
  const value = anchor.replace(/^#/, '')
  try {
    return encodeURIComponent(decodeURIComponent(value))
  }
  catch { return encodeURIComponent(value) }
}
// Unrelated settings/catalog projections preserve the current document's scroll and metadata.
watch([
  () => snapshot.value.status,
  () => snapshot.value.stale,
  () => snapshot.value.source?.sourceId,
  () => snapshot.value.source?.epoch,
  () => snapshot.value.source?.revision,
  () => story.value?.id,
], () => {
  path.value = undefined
  titleInContent.value = false
  loaded.value = false
  empty.value = false
  copied.value = false
  currentAnchor.value = props.anchor
  if (root.value) root.value.scrollTop = 0
  void nextTick().then(outline.refresh)
}, { flush: 'sync' })

/** Renderer stays authoritative; outline waits until its committed DOM is available. */
async function content(value: HistoireDocsContent): Promise<void> {
  const owner = ownership.capture()
  if (!ownership.owns(owner) || value.storyId !== story.value?.id || value.epoch !== owner.source?.epoch || value.revision !== owner.source?.revision) return
  path.value = value.relativePath
  empty.value = !value.body.trim()
  await nextTick()
  if (!ownership.owns(owner)) return
  titleInContent.value = !!root.value?.querySelector('.histoire-docs h1')
  loaded.value = true
  outline.refresh()
}

/** Current canonical guide target dispatches through existing finite editor action. */
async function edit(): Promise<void> {
  if (!canEdit.value || !story.value) return
  const owner = ownership.capture()
  try {
    await requestHistoireOpenInEditor(session, { storyId: story.value.id, variantId: null })
  }
  catch (error) { if (ownership.owns(owner)) emit('error', error) }
}

/** Preserve router URL, including hash-router route, when copying local outline anchor. */
async function copyLink(): Promise<void> {
  const window = root.value?.ownerDocument.defaultView
  if (!window) return
  const url = new URL(window.location.href)
  if (currentAnchor.value) {
    const anchor = encodedAnchor(currentAnchor.value)
    if (url.hash.startsWith('#/')) url.hash = `${url.hash.split('#').slice(0, 2).join('#')}#${anchor}`
    else url.hash = anchor
  }
  const owner = ownership.capture()
  try {
    await window.navigator.clipboard.writeText(url.href)
    if (ownership.owns(owner)) copied.value = true
  }
  catch (error) { if (ownership.owns(owner)) emit('error', error) }
}

/** Prev/next stays in the same catalog group and never requests a preview variant. */
async function select(target: HistoireSelectionInput): Promise<void> {
  await ownership.select(target, selected => emit('select', selected), error => emit('error', error))
}
</script>

<template>
  <main ref="root" class="histoire-markdown-page" data-histoire-docs-scroll>
    <div class="histoire-markdown-actions">
      <HstButton v-if="canEdit" color="default" type="button" @click="edit">
        <WorkbenchIcon name="edit" />Edit .md
      </HstButton>
      <HstButton color="default" type="button" :aria-label="copied ? 'Link copied' : 'Copy link'" :title="copied ? 'Link copied' : 'Copy link'" @click="copyLink">
        <WorkbenchIcon :name="copied ? 'checkmark-filled' : 'link'" />
      </HstButton>
    </div>
    <div class="histoire-markdown-layout">
      <article class="histoire-markdown-article">
        <p class="histoire-markdown-path">
          <WorkbenchIcon name="document" />{{ path ?? story?.relativePath ?? story?.title }}
        </p>
        <h1 v-if="!story?.content.docs || (loaded && !titleInContent)">
          {{ story?.title }}
        </h1>
        <HistoireDocs v-if="story?.content.docs" :key="story.id" :anchor="anchor" @anchor="currentAnchor = $event; copied = false" @content="content" @error="emit('error', $event)" />
        <p v-if="empty || !story?.content.docs" class="histoire-markdown-empty">
          No Markdown content for {{ path ?? story?.relativePath ?? story?.title }}.
        </p>
        <MarkdownPager :previous="pager.previous" :next="pager.next" @select="select" />
      </article>
      <MarkdownOutline :headings="outline.headings.value" :active="outline.active.value" @select="outline.select($event); currentAnchor = $event.id; copied = false" />
    </div>
  </main>
</template>
