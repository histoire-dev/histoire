import type { HistoireCatalogTreeNode, HistoireTarget } from '@histoire/protocol'
import type { PropType, VNode } from 'vue'
import { HstButton } from '@histoire/controls/vue'
import { defineComponent, h, shallowRef } from 'vue'
import { useHistoireSnapshot } from '../../composables/snapshot.js'
import { useHistoireContext } from '../../provider/context.js'

/** Catalog navigation consumes exact IDs and remembers variants through session selection. */
export const HistoireStoryTree = defineComponent({
  name: 'HistoireStoryTree',
  props: {
    showVariants: { type: Boolean, default: true },
    foldersInitiallyOpen: { type: Boolean, default: true },
    expandedPaths: { type: Array as PropType<readonly (readonly string[])[]>, default: undefined },
  },
  emits: ['select', 'folder', 'error'],
  setup(props, { emit }) {
    const { session } = useHistoireContext()
    const snapshot = useHistoireSnapshot()
    const folders = shallowRef(new Map<string, boolean>())
    /** Caller owns routing; successful activation reports canonical resolved target. */
    function select(target: HistoireTarget | { storyId: string }) {
      void session.selection.select(target).then(() => emit('select', session.getSnapshot().selection)).catch(error => emit('error', error))
    }
    /** Recursive catalog tree keeps source group ordering, without array-offset story identities. */
    function rows(nodes: readonly HistoireCatalogTreeNode[], path: readonly string[] = []): VNode[] {
      return nodes.map((node) => {
        if (node.kind === 'group') return h('li', { key: node.id ?? node.title }, [h('div', node.title), h('ul', rows(node.children, path))])
        if (node.kind === 'folder') {
          const full = [...path, node.title]
          const key = JSON.stringify(full)
          const open = props.expandedPaths ? props.expandedPaths.some(value => JSON.stringify(value) === key) : folders.value.get(key) ?? props.foldersInitiallyOpen
          return h('li', { 'key': key, 'data-test-id': 'story-list-folder' }, h('details', { open, onToggle: (event: Event) => {
            const value = (event.currentTarget as HTMLDetailsElement).open
            if (value === open) return
            folders.value = new Map(folders.value).set(key, value)
            emit('folder', { path: full, open: value })
          } }, [h('summary', node.title), open ? h('ul', rows(node.children, full)) : null]))
        }
        if (node.kind !== 'story') return h('li')
        const matches = snapshot.value.catalog.stories.filter(story => story.id === node.storyId)
        const story = matches.length === 1 ? matches[0] : undefined
        const active = snapshot.value.selection
        return h('li', { key: node.storyId }, [
          h(HstButton, { 'color': 'flat', 'type': 'button', 'data-test-id': 'story-list-item', 'aria-label': story?.title ?? node.title, 'aria-current': active?.storyId === node.storyId ? 'true' : undefined, 'disabled': !story, 'onClick': () => select({ storyId: node.storyId }) }, { default: () => [node.title, story && !story.docsOnly ? h('span', { class: 'histoire-story-variant-count' }, ` ${story.variants.length}`) : null] }),
          props.showVariants && story && !story.docsOnly
            ? h('ul', story.variants.map(variant => h('li', { key: variant.id }, h(HstButton, { 'color': 'flat', 'type': 'button', 'aria-label': `${story.title} / ${variant.title}`, 'aria-current': active?.storyId === story.id && active.variantId === variant.id ? 'true' : undefined, 'onClick': () => select({ storyId: story.id, variantId: variant.id }) }, { default: () => variant.title }))))
            : null,
        ])
      })
    }
    return () => h('nav', { 'class': 'histoire-tree', 'aria-label': 'Histoire stories' }, [
      snapshot.value.status === 'failed' || (snapshot.value.source && !snapshot.value.capabilities.catalog.available) ? h('p', { role: 'alert' }, 'Catalog unavailable') : null,
      h('ul', rows(snapshot.value.catalog.tree)),
    ])
  },
})
