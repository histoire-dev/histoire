<script setup lang="ts">
import type { HistoireSelectionInput, HistoireSourceIdentity, HistoireTarget } from '@histoire/protocol'
import type { createStandaloneFolders } from '../../../standalone/folders.js'
import type { StoryTreeRow } from './tree.js'
import { BuiltinIcon, HstButton } from '@histoire/controls/vue'
import { getHistoireTargetKey } from '@histoire/protocol'
import { useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { isContextMenuShortcut, useContextMenu } from '../../../composables/context-menu.js'
import { histoireConfig } from '../../../util/config.js'
import WorkbenchVirtualList from '../../lists/WorkbenchVirtualList.vue'
import WorkbenchErrorState from '../../shell/WorkbenchErrorState.vue'

import { useWorkbenchTestsModel } from '../tests/model.js'
import { useStoryRowStatus } from './row-status.js'
import { createStoryTreeRows, nextTreeFocus } from './tree.js'

const props = defineProps<{
  /** Existing standalone adapter retains authoritative legacy folder preferences. */
  folders: ReturnType<typeof createStandaloneFolders>
}>()
const emit = defineEmits<{
  /** Canonical successful SDK selection handed to standalone router. */
  select: [target: HistoireTarget]
  /** Exact variant whose visible canvas frame should fill available space. */
  fit: [target: HistoireTarget]
  /** Observed activation error handed to provider. */
  error: [error: unknown]
}>()
const { session } = useHistoireContext()
const menu = useContextMenu()
const snapshot = shallowRef(session.getSnapshot())
useHistoireResource(session.subscribe(value => snapshot.value = value))
const tests = useWorkbenchTestsModel()
const tree = ref<HTMLElement>()
const virtualList = ref<{ focus: (key: string) => Promise<void>, reveal: (key: string) => Promise<void> }>()
const focused = ref('')
const treeTabStop = ref(false)
const collapsedStory = ref('')
let active = true
let activationGeneration = 0
let selectionIntent: HistoireSelectionInput | undefined
let treeObserver: MutationObserver | undefined
useHistoireResource(() => {
  active = false
})
// Field computeds keep identity across unrelated publications, so rows (and the
// virtual scroller watching them) only rebuild when tree inputs actually change.
const catalog = computed(() => snapshot.value.catalog)
const selection = computed<HistoireTarget | null>(previous => sameTarget(previous, snapshot.value.selection) ? previous! : snapshot.value.selection)
const { hasDiagnostic, testsFailing } = useStoryRowStatus(catalog, tests)
const rows = computed(() => createStoryTreeRows(catalog.value, selection.value, props.folders.expandedPaths.value, collapsedStory.value !== selection.value?.storyId))
const items = computed(() => rows.value.filter(row => row.kind !== 'group'))
const title = computed(() => histoireConfig.theme.title ?? 'Stories')
const menuDisposers = [
  menu?.register({ id: 'stories.folder.expand', label: 'Expand folder', icon: 'folder-open', available: target => target.kind === 'folder' && !target.expanded && Boolean(target.path), run: (target) => {
    if (target.kind === 'folder' && target.path) props.folders.toggle({ path: target.path, open: true })
  } }),
  menu?.register({ id: 'stories.folder.collapse', label: 'Collapse folder', icon: 'folder', available: target => target.kind === 'folder' && target.expanded && Boolean(target.path), run: (target) => {
    if (target.kind === 'folder' && target.path) props.folders.toggle({ path: target.path, open: false })
  } }),
].filter((dispose): dispose is () => void => Boolean(dispose))
useHistoireResource(() => menuDisposers.forEach(dispose => dispose()))

watch(items, (value) => {
  if (value.some(row => row.key === focused.value)) return
  const hadFocus = tree.value?.contains(tree.value.ownerDocument.activeElement)
  focused.value = value.find(row => row.selected)?.key ?? value[0]?.key ?? ''
  if (hadFocus && focused.value) void focus(focused.value)
}, { immediate: true })

/** Source replacement and external selection retire feedback owned by an older row intent. */
watch(() => sourceKey(snapshot.value.source), () => {
  activationGeneration++
  selectionIntent = undefined
})
watch(() => snapshot.value.selection, (selection) => {
  if (sameSelectionIntent(selection, selectionIntent)) return
  activationGeneration++
  selectionIntent = undefined
})

/** A recycled roving row cannot remain tree's only Tab entry. */
function syncTreeTabStop(): void {
  const key = focused.value
  const mounted = Array.from(tree.value?.querySelectorAll<HTMLElement>('[data-tree-key]') ?? []).some(row => row.dataset.treeKey === key)
  treeTabStop.value = Boolean(key && !mounted)
}

/** Recycler mounts after its scroll event; defer DOM inspection until that publication settles. */
function scheduleTreeTabStop(): void {
  void nextTick().then(() => {
    if (active) syncTreeTabStop()
  })
}

onMounted(() => {
  if (!tree.value) return
  treeObserver = new MutationObserver(scheduleTreeTabStop)
  treeObserver.observe(tree.value, { childList: true, subtree: true })
  scheduleTreeTabStop()
})
onBeforeUnmount(() => treeObserver?.disconnect())
watch([items, focused], scheduleTreeTabStop, { flush: 'post' })

/** Await canonical selection so same-story variant activation keeps current runtime. */
async function select(row: StoryTreeRow): Promise<void> {
  if (!row.target) return
  const generation = ++activationGeneration
  selectionIntent = { ...row.target }
  const source = snapshot.value.source
  if (row.kind === 'story') collapsedStory.value = ''
  /** Error feedback belongs only to this source/target selection intent. */
  function ownsFeedback(): boolean {
    const current = session.getSnapshot()
    return active && generation === activationGeneration && sameSource(current.source, source)
  }
  try {
    await session.selection.select(row.target)
    const current = session.getSnapshot()
    const target = current.selection
    if (ownsFeedback() && !current.stale && target?.storyId === row.target.storyId && (!('variantId' in row.target) || row.target.variantId === target?.variantId)) emit('select', target)
  }
  catch (error) { if (ownsFeedback()) emit('error', error) }
}

/** Selection errors cannot leak between catalog source identities. */
function sameSource(current: HistoireSourceIdentity | undefined, source: HistoireSourceIdentity | undefined): boolean {
  return current?.sourceId === source?.sourceId && current?.epoch === source?.epoch && current?.revision === source?.revision
}

/** Internal story rows can resolve a remembered variant, so omit means any variant in that story. */
function sameSelectionIntent(selection: HistoireTarget | null, intent: HistoireSelectionInput | undefined): boolean {
  return !!selection && !!intent && selection.storyId === intent.storyId && (intent.variantId === undefined || selection.variantId === intent.variantId)
}

/** Compact stable source key makes HMR retirement independent of object allocation. */
function sourceKey(source: HistoireSourceIdentity | undefined): string {
  return JSON.stringify([source?.sourceId, source?.epoch, source?.revision])
}

/** Explicit folder changes retain authoritative standalone folder preferences. */
function toggle(row: StoryTreeRow): void {
  if (row.path) props.folders.toggle({ path: row.path, open: !row.expanded })
  if (row.kind === 'story' && row.story?.id === snapshot.value.selection?.storyId) collapsedStory.value = row.expanded ? row.story.id : ''
}

/** Open on immutable row identity so virtual-list recycling cannot retarget actions. */
function openMenu(event: MouseEvent | KeyboardEvent, row: StoryTreeRow): void {
  if (!menu) return
  if (row.kind === 'variant' && row.target && 'variantId' in row.target && row.target.variantId !== null) {
    menu.open(event, { storyId: row.target.storyId, variantId: row.target.variantId, frameKey: getHistoireTargetKey(row.target) })
    return
  }
  if (row.kind === 'folder' && row.path) {
    menu.open(event, { kind: 'folder', key: row.key, label: row.title, path: [...row.path], expanded: Boolean(row.expanded) }, [row.expanded ? 'stories.folder.collapse' : 'stories.folder.expand'])
    return
  }
  if (!row.target || row.kind === 'group') return
  const selection: HistoireSelectionInput = 'variantId' in row.target ? { ...row.target } : { storyId: row.target.storyId }
  menu.open(event, { kind: 'story', key: row.key, label: row.title, selection }, ['stories.select', 'context.copy-link', 'story.embed'])
}

/** Variant rows retain an exact frame target; stories and folders have no single frame. */
function fit(row: StoryTreeRow): void {
  if (row.kind !== 'variant' || !row.target || !('variantId' in row.target) || row.target.variantId === null) return
  emit('fit', row.target)
}

/** Roving focus waits for folder and current-story children to enter DOM. */
async function focus(key: string): Promise<void> {
  focused.value = key
  await virtualList.value?.focus(key)
}

/** Expand target ancestry, then scroll its exact current variant row into view. */
async function revealVariant(target: { storyId: string, variantId: string }): Promise<void> {
  if (!active || snapshot.value.selection?.storyId !== target.storyId || snapshot.value.selection.variantId !== target.variantId) return
  props.folders.revealStory(target.storyId)
  collapsedStory.value = ''
  await nextTick()
  if (!active || snapshot.value.selection?.storyId !== target.storyId || snapshot.value.selection.variantId !== target.variantId) return
  const row = items.value.find((item) => {
    if (item.kind !== 'variant' || !item.target || !('variantId' in item.target)) return false
    return item.target.storyId === target.storyId && item.target.variantId === target.variantId
  })
  if (row) await virtualList.value?.reveal(row.key)
}
defineExpose({ revealVariant })

/** Tree keyboard follows visible rows and never leaks arrow keys into canvas. */
async function onKeydown(event: KeyboardEvent, row: StoryTreeRow): Promise<void> {
  if (isContextMenuShortcut(event)) {
    openMenu(event, row)
    return
  }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) return
  event.preventDefault()
  if (event.key === 'Enter' || event.key === ' ') {
    if (row.kind === 'folder') toggle(row)
    else await select(row)
    return
  }
  if (event.key === 'ArrowLeft' && row.expanded && (row.kind === 'story' || row.kind === 'folder')) {
    toggle(row)
    return
  }
  if (event.key === 'ArrowRight' && row.expanded === false) {
    if (row.kind === 'folder' || row.story?.id === snapshot.value.selection?.storyId) toggle(row)
    else await select(row)
    return
  }
  await focus(nextTreeFocus(items.value, row.key, event.key))
}

/** Fallback tree entry restores the logical roving row only after keyboard focus enters. */
function onTreeFocus(event: FocusEvent): void {
  if (event.target === tree.value && focused.value) void focus(focused.value)
}

/** Container owns keyboard only while it is the recycler fallback focus target. */
function onTreeKeydown(event: KeyboardEvent): void {
  if (event.target !== tree.value) return
  const row = items.value.find(value => value.key === focused.value)
  if (row) void onKeydown(event, row)
}

/** Exact canonical target equality; publications may reallocate an unchanged selection. */
function sameTarget(a: HistoireTarget | null | undefined, b: HistoireTarget | null): boolean {
  return a === b || (!!a && !!b && a.storyId === b.storyId && a.variantId === b.variantId)
}

/** Preserve custom story icons; docs and stories receive distinct defaults. */
function icon(row: StoryTreeRow): string {
  if (row.kind === 'folder') return 'folder'
  if (row.kind === 'variant') return 'dot-mark'
  return row.story?.icon ?? (row.story?.docsOnly ? 'document' : 'cube')
}
</script>

<template>
  <section class="stories-panel" aria-label="Stories">
    <header class="stories-heading">
      <h2>{{ title }}</h2>
      <span class="stories-count">{{ snapshot.catalog.stories.length }} stories</span>
    </header>
    <WorkbenchErrorState v-if="snapshot.status === 'failed' || (snapshot.source && !snapshot.capabilities.catalog.available)" title="Catalog unavailable" />
    <div ref="tree" class="stories-tree" role="tree" aria-label="Story tree" :tabindex="treeTabStop ? 0 : -1" @focus="onTreeFocus" @keydown="onTreeKeydown" @scroll.capture="scheduleTreeTabStop">
      <WorkbenchVirtualList ref="virtualList" :items="rows" :item-size="32">
        <template #default="{ item: row }">
          <h3 v-if="row.kind === 'group'" class="stories-group">
            {{ row.title }}
          </h3>
          <HstButton
            v-else
            color="flat"
            type="button"
            role="treeitem"
            class="stories-row"
            :class="{ 'stories-current': row.kind === 'story' && selection?.storyId === row.story?.id }"
            :style="{ paddingInlineStart: `${8 + row.depth * 16}px` }"
            :data-tree-key="row.key"
            :data-test-id="row.kind === 'story' ? 'story-list-item' : row.kind === 'folder' ? 'story-list-folder' : 'story-list-variant'"
            :aria-level="row.depth + 1"
            :aria-expanded="row.expanded"
            :aria-selected="row.selected ?? false"
            :aria-label="`${row.title}${testsFailing(row) ? ', tests failing' : ''}${hasDiagnostic(row) ? ', collection warning' : ''}`"
            :tabindex="focused === row.key ? 0 : -1"
            @focus="focused = row.key"
            @keydown="onKeydown($event, row)"
            @click="row.kind === 'folder' ? toggle(row) : select(row)"
            @dblclick="fit(row)"
            @contextmenu="openMenu($event, row)"
          >
            <BuiltinIcon v-if="row.expanded !== undefined" :icon="row.expanded ? 'chevron-down' : 'chevron-right'" class="stories-chevron" :size="16" />
            <span v-else class="stories-chevron" />
            <BuiltinIcon :icon="icon(row)" class="stories-icon" :style="{ color: row.kind === 'story' ? row.story?.iconColor : undefined }" :size="16" />
            <span class="stories-label">{{ row.title }}</span>
            <span v-if="row.kind === 'story' && !row.story?.docsOnly" class="stories-variants">{{ row.story?.variants.length }}</span>
            <BuiltinIcon v-if="hasDiagnostic(row)" icon="warning-alt-filled" class="stories-warning" :size="16" />
            <BuiltinIcon v-if="testsFailing(row)" icon="error-filled" class="stories-failing" :size="16" />
          </HstButton>
        </template>
      </WorkbenchVirtualList>
    </div>
    <p v-if="!items.length && snapshot.capabilities.catalog.available" class="stories-empty" role="status">
      No stories
    </p>
  </section>
</template>

<style scoped>
.stories-panel { display: flex; flex-direction: column; min-height: 0; height: 100%; padding: 16px calc(var(--histoire-pane-gutter, 16px) - 8px); color: var(--histoire-text); }
.stories-heading { display: flex; align-items: baseline; gap: 8px; padding: 0 8px; margin-bottom: 18px; }
.stories-heading h2 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 800; margin: 0; }
.stories-count, .stories-variants { font-family: var(--histoire-font-mono); font-size: 11px; color: var(--histoire-muted); white-space: nowrap; }
.stories-tree { flex: 1; min-height: 0; overflow: hidden; list-style: none; margin: 0; padding: 0; }
.stories-group { height: var(--histoire-virtual-row-height, 31px); display: flex; align-items: flex-end; padding: 0 8px var(--histoire-story-row-padding, 6px); margin: 0; font-size: 11px; color: var(--histoire-muted); font-weight: 700; }
.stories-row { display: flex; align-items: center; gap: 7px; width: 100%; height: var(--histoire-virtual-row-height, 31px); padding: var(--histoire-story-row-padding, 6px) 8px; color: inherit; line-height: 18px; text-align: start; }
.stories-row:hover, .stories-current { background: var(--histoire-chip); }
.stories-current { font-weight: 700; }
.stories-row[aria-selected="true"] { background: var(--histoire-accent-soft); color: var(--histoire-accent-text); font-weight: 700; }
.stories-row:focus-visible { outline: 2px solid var(--histoire-accent); outline-offset: -2px; }
.stories-chevron { flex: none; width: 11px; height: 11px; color: var(--histoire-muted); }
.stories-icon { flex: none; width: 16px; height: 16px; color: var(--histoire-muted); }
.stories-row[aria-selected="true"] .stories-icon { color: var(--histoire-accent); }
.stories-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stories-failing, .stories-warning { flex: none; width: 12px; height: 12px; }
.stories-failing { color: var(--histoire-danger); }
.stories-warning { color: var(--histoire-warn); }
.stories-empty { margin: 12px 8px; color: var(--histoire-muted); }
</style>
