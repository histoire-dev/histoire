import { HstButton, HstSelect } from '@histoire/controls/vue'
import { waitForHistoireSelection } from '@histoire/sdk/internal'
import { defineComponent, h, nextTick, shallowRef, watch } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { useHistoireContext, useHistoireResource } from '../../provider/context.js'
import { HistoireDocs } from '../docs/HistoireDocs.js'
import { HistoirePreview } from '../preview/HistoirePreview.js'
import { HistoireVariantGrid } from '../preview/HistoireVariantGrid.js'

/** Explorer primary layout switches only after owned runtime teardown finishes. */
export const ExplorerPreview = defineComponent({
  name: 'HistoireExplorerPreview',
  props: { active: { type: Boolean, default: true }, docsAnchor: { type: String, default: '' } },
  emits: ['ready', 'error'],
  setup(props, { emit, slots }) {
    const { session } = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const layout = shallowRef<'preview' | 'grid'>('preview')
    const mode = shallowRef<'preview' | 'grid' | 'docs' | 'empty'>('empty')
    const switching = shallowRef(false)
    const primary = shallowRef<{ unmount: () => Promise<void> } | null>(null)
    let generation = 0
    let active = true
    let closing = Promise.resolve()
    /** Preserve primary slot ownership until old transport actually closes. */
    async function select(value: typeof mode.value, automatic = false): Promise<void> {
      const token = ++generation
      if (!switching.value && mode.value === value) return
      const nextLayout = value === 'preview' || value === 'grid' ? value : layout.value
      // Retain a settled transport for null targets. During teardown the latest
      // transition must join closing and clear switching after its predecessor retires.
      if (!switching.value && props.active && nextLayout === layout.value) {
        mode.value = value
        return
      }
      if (automatic && props.active && primary.value) {
        await waitForHistoireSelection(session)
        if (!active || token !== generation) return
      }
      const owned = primary.value
      switching.value = true
      try {
        if (owned) closing = owned.unmount()
        await closing
        if (!active || token !== generation) return
        await nextTick()
        if (!active || token !== generation) return
        mode.value = value
        if (value === 'preview' || value === 'grid') layout.value = value
        switching.value = false
      }
      catch (error) {
        if (active && token === generation) emit('error', error)
      }
    }
    watch([() => snapshot.value.selection?.storyId, () => props.active, () => snapshot.value.catalog.stories.find(story => story.id === snapshot.value.selection?.storyId)?.docsOnly, () => snapshot.value.catalog.stories.find(story => story.id === snapshot.value.selection?.storyId)?.layout?.type], () => {
      const story = snapshot.value.catalog.stories.find(story => story.id === snapshot.value.selection?.storyId)
      void select(!props.active || !story ? 'empty' : story.docsOnly ? 'docs' : story.layout?.type === 'grid' ? 'grid' : 'preview', true)
    }, { immediate: true })
    /** Catalog variant choice changes canonical target, retaining owned primary transport. */
    function selectVariant(variantId: string): void {
      const storyId = snapshot.value.selection?.storyId
      if (!active || !storyId) return
      void session.selection.select({ storyId, variantId }).catch((error) => {
        if (active) emit('error', error)
      })
    }
    useHistoireResource(() => {
      active = false
      generation++
      return primary.value?.unmount() ?? closing
    })
    return () => {
      const story = snapshot.value.catalog.stories.find(story => story.id === snapshot.value.selection?.storyId)
      const showingRuntime = mode.value === 'preview' || mode.value === 'grid'
      return h('main', { 'class': 'histoire-explorer-preview', 'aria-label': 'Histoire preview' }, [
        mode.value === 'docs' ? h(HistoireDocs, { key: 'docs', anchor: props.docsAnchor, onError: error => emit('error', error) }) : mode.value === 'empty' ? slots.empty?.() : null,
        showingRuntime
          ? h('div', { class: 'histoire-explorer-layout' }, [
              snapshot.value.selection?.variantId && story ? h(HstSelect, { 'layout': 'inline', 'aria-label': 'Variant', 'modelValue': snapshot.value.selection.variantId, 'onUpdate:modelValue': selectVariant, 'options': story.variants.map(variant => ({ value: variant.id, label: variant.title })) }) : null,
              h(HstButton, { 'color': 'flat', 'type': 'button', 'aria-label': 'Show single preview', 'aria-pressed': layout.value === 'preview', 'onClick': () => void select('preview') }, { default: () => 'Preview' }),
              h(HstButton, { 'color': 'flat', 'type': 'button', 'aria-label': 'Show variant grid', 'aria-pressed': layout.value === 'grid', 'onClick': () => void select('grid') }, { default: () => 'Grid' }),
            ])
          : null,
        showingRuntime && !snapshot.value.selection?.variantId && story ? h('div', { 'role': 'group', 'aria-label': 'Choose variant' }, story.variants.map(variant => h(HstButton, { 'color': 'flat', 'type': 'button', 'data-test-id': 'story-variant-list-item', 'onClick': () => void session.selection.select({ storyId: story.id, variantId: variant.id }).catch(error => emit('error', error)) }, { default: () => variant.title }))) : null,
        props.active && !switching.value ? h(layout.value === 'grid' ? HistoireVariantGrid : HistoirePreview, { 'key': 'runtime', 'ref': primary, 'style': showingRuntime ? undefined : { position: 'absolute', inset: '0', visibility: 'hidden', pointerEvents: 'none' }, 'aria-hidden': !showingRuntime, 'onReady': () => emit('ready'), 'onError': error => emit('error', error) }) : null,
      ])
    }
  },
})
