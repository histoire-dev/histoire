import type { HistoireEmbedPanel } from '@histoire/protocol'
import type { PropType } from 'vue'
import { HstSelect } from '@histoire/controls/vue'
import { HistoireSdkError, validateEmbedPanels } from '@histoire/protocol'
import { computed, defineComponent, h, shallowRef, watch } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { useHistoireContext, useHistoireResource } from '../../provider/context.js'
import { HistoirePreview } from '../preview/HistoirePreview.js'
import { EmbedPanels } from './EmbedPanels.js'
import { useEmbedGeometry } from './geometry.js'

/** Compact composition captures one story or exact variant from its explicit session. */
export const HistoireEmbed = defineComponent({
  name: 'HistoireEmbed',
  props: {
    /** Story scope offers a local variant switcher; variant scope stays fixed. */
    scope: { type: String as PropType<'story' | 'variant'>, required: true },
    /** Enabled panels; empty array gives canvas only. */
    panels: { type: Array as PropType<readonly HistoireEmbedPanel[]>, default: () => ['controls'] },
  },
  emits: ['ready', 'error'],
  setup(props, { emit, slots }) {
    const { session } = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const initial = session.getSnapshot()
    const target = initial.selection && { ...initial.selection }
    const canvas = shallowRef<HTMLElement | null>(null)
    let active = true
    let generation = 0
    /** Emit only from this live composition; caller keeps session ownership. */
    function error(value: unknown): void {
      if (active) emit('error', value)
    }
    const story = computed(() => {
      const matches = snapshot.value.catalog.stories.filter(story => story.id === target?.storyId)
      return matches.length === 1 ? matches[0] : undefined
    })
    const valid = computed(() => ['story', 'variant'].includes(props.scope) && initial.status === 'ready' && target?.variantId
      && snapshot.value.status === 'ready' && !snapshot.value.stale
      && snapshot.value.source?.sourceId === initial.source?.sourceId && snapshot.value.source?.epoch === initial.source?.epoch
      && story.value && !story.value.docsOnly && snapshot.value.selection?.storyId === target.storyId
      && story.value.variants.some(variant => variant.id === snapshot.value.selection?.variantId)
      && (props.scope === 'story' || snapshot.value.selection?.variantId === target.variantId))
    const panels = computed(() => validateEmbedPanels(props.panels).filter(panel => panel === 'docs'
      ? story.value?.content.docs && snapshot.value.capabilities.docs.available
      : panel === 'source' ? story.value?.content.rawSource && snapshot.value.capabilities.rawSource.available : true))
    watch(valid, (value) => {
      if (!value) error(new HistoireSdkError('VARIANT_NOT_FOUND', 'Embedded target is unavailable'))
    }, { immediate: true })
    useEmbedGeometry(session, canvas, error)
    useHistoireResource(() => {
      active = false
      generation++
    })
    /** Dropdown selections retain captured story and suppress overtaken failures. */
    function selectVariant(variantId: string): void {
      if (!active || !valid.value || !story.value?.variants.some(variant => variant.id === variantId)) return
      const current = ++generation
      void session.selection.select({ storyId: target!.storyId, variantId }).catch((value) => {
        if (active && generation === current && snapshot.value.selection?.variantId === variantId) error(value)
      })
    }
    return () => {
      if (!valid.value) return slots.error?.() ?? h('div', { role: 'alert' }, 'Embedded target is unavailable')
      const selected = snapshot.value.selection!.variantId!
      const variant = story.value!.variants.find(variant => variant.id === selected)!
      return h('section', { 'class': 'histoire-embed', 'aria-label': props.scope === 'story' ? `Embedded story: ${story.value!.title}` : `Embedded variant: ${variant.title}` }, [
        h('header', { class: 'histoire-embed-header' }, [
          h('strong', props.scope === 'story' ? story.value!.title : variant.title),
          props.scope === 'story' ? h(HstSelect, { 'layout': 'inline', 'aria-label': 'Variant', 'modelValue': selected, 'options': story.value!.variants.map(variant => ({ value: variant.id, label: variant.title })), 'onUpdate:modelValue': selectVariant }) : null,
        ]),
        h('div', { class: 'histoire-embed-workspace' }, [
          h('main', { 'ref': canvas, 'class': 'histoire-embed-canvas', 'aria-label': 'Canvas' }, [h(HistoirePreview, { onReady: () => active && emit('ready'), onError: error }, slots.canvas)]),
          panels.value.length ? h(EmbedPanels, { panels: panels.value, onError: error }) : null,
        ]),
      ])
    }
  },
})
