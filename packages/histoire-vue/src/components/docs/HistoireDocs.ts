import type { HistoireContentState } from '../../content/controller.js'
import type { HistoirePreparedDocs } from './content.js'
import { HistoireSdkError, isStoryRouteHash } from '@histoire/protocol'
import { getHistoireDocsPolicy, selectHistoireStoryLink } from '@histoire/sdk/internal'
import { defineComponent, h, nextTick, onMounted, shallowRef, watch } from 'vue'
import { createHistoireContentController } from '../../content/controller.js'
import { useHistoireContext, useHistoireResource } from '../../provider/context.js'
import { scrollDocsAnchor } from './anchors.js'
import { prepareHistoireDocs } from './content.js'
import { resolveDocsStoryLink } from './links.js'

/** Independent data-only documentation; no host story import or host router dependency. */
export const HistoireDocs = defineComponent({
  name: 'HistoireDocs',
  props: { anchor: { type: String, default: '' } },
  emits: ['content', 'error', 'anchor'],
  setup(props, { emit, expose }) {
    const context = useHistoireContext()
    const { session } = context
    const root = shallowRef<HTMLElement | null>(null)
    const state = shallowRef<HistoireContentState<HistoirePreparedDocs>>({ status: 'idle', value: null, error: null })
    let pendingAnchor: { hash: string, storyId: string, variantId: string | null, sourceId: string, epoch: string, revision: string } | undefined
    let navigation = 0
    let active = true
    /** A deferred link/anchor never gains authority over replacement selection or source. */
    function anchorIsCurrent() {
      const value = session.getSnapshot()
      return active && pendingAnchor && value.status === 'ready' && !value.stale && value.selection?.storyId === pendingAnchor.storyId && value.selection.variantId === pendingAnchor.variantId && value.source?.sourceId === pendingAnchor.sourceId && value.source.epoch === pendingAnchor.epoch && value.source.revision === pendingAnchor.revision
    }
    useHistoireResource(session.subscribe(() => {
      if (pendingAnchor && !anchorIsCurrent()) pendingAnchor = undefined
    }))
    const controller = createHistoireContentController(session, () => {
      const value = session.getSnapshot()
      return [value.status, value.stale, value.source?.epoch, value.source?.revision, value.selection?.storyId]
    }, async () => {
      const snapshot = session.getSnapshot()
      if (!snapshot.selection || !root.value || !snapshot.source) return null
      const document = root.value.ownerDocument
      return prepareHistoireDocs(await session.docs.get(snapshot.selection.storyId), snapshot.source.url, document, getHistoireDocsPolicy(session))
    }, (value) => {
      state.value = value
      if (value.status === 'ready') emit('content', value.value!.content)
      if (value.status === 'error') emit('error', value.error)
    })
    useHistoireResource(() => {
      active = false
      navigation++
      controller.close()
    })
    expose({ refresh: controller.refresh })
    onMounted(() => void controller.start())
    watch(() => [state.value.value, props.anchor, context.panels.docs.value?.anchor], async () => {
      await nextTick()
      if (root.value && state.value.status === 'ready') {
        scrollDocsAnchor(root.value, anchorIsCurrent() ? pendingAnchor!.hash : props.anchor || context.panels.docs.value?.anchor || '')
        pendingAnchor = undefined
      }
    })
    /** Known story links route through same controller; local anchors never touch host URL. */
    function click(event: MouseEvent) {
      if (!active || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element)?.closest<HTMLAnchorElement>('a')
      if (!link || !root.value?.contains(link)) return
      const href = link.getAttribute('href')
      if (!href) return
      if (href.startsWith('#') && !isStoryRouteHash(href)) {
        event.preventDefault()
        if (scrollDocsAnchor(root.value, href)) emit('anchor', href)
        return
      }
      const snapshot = session.getSnapshot()
      const target = snapshot.source && resolveDocsStoryLink(href, snapshot.source.url, snapshot.catalog.stories, link.getAttribute('data-histoire-story-path'))
      if (!target && !link.hasAttribute('data-route')) return
      event.preventDefault()
      if (!target) {
        emit('error', new HistoireSdkError('STORY_NOT_FOUND', 'Documentation story link unavailable'))
        return
      }
      const current = ++navigation
      void selectHistoireStoryLink(session, target).then(async () => {
        const selected = session.getSnapshot()
        if (!active || current !== navigation || selected.status !== 'ready' || selected.stale || selected.selection?.storyId !== target.selection.storyId || (target.selection.variantId !== undefined && selected.selection.variantId !== target.selection.variantId) || selected.source?.sourceId !== snapshot.source?.sourceId || selected.source?.epoch !== snapshot.source?.epoch || selected.source?.revision !== snapshot.source?.revision) return
        const anchor = { hash: target.anchor ?? '', storyId: selected.selection.storyId, variantId: selected.selection.variantId, sourceId: selected.source!.sourceId, epoch: selected.source!.epoch, revision: selected.source!.revision }
        pendingAnchor = anchor
        await nextTick()
        if (active && pendingAnchor === anchor && anchorIsCurrent() && root.value && state.value.status === 'ready' && state.value.value?.content.storyId === anchor.storyId) {
          scrollDocsAnchor(root.value, anchor.hash)
          pendingAnchor = undefined
        }
      }).catch((error) => {
        const selected = session.getSnapshot()
        if (active && current === navigation && selected.source?.sourceId === snapshot.source?.sourceId && selected.source?.epoch === snapshot.source?.epoch && selected.source?.revision === snapshot.source?.revision) emit('error', error)
      })
    }
    return () => {
      const value = state.value.value
      return h('section', { 'ref': root, 'class': 'histoire-docs', 'aria-label': 'Histoire documentation', 'aria-busy': state.value.status === 'loading', 'onClick': click }, [
        state.value.error ? h('p', { role: 'alert' }, (state.value.error as Error).message ?? String(state.value.error)) : null,
        value ? (value.html === null ? h('pre', value.content.body) : h('div', { innerHTML: value.html })) : null,
      ])
    }
  },
})
