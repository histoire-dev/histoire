import type { HistoireCatalogTreeNode } from '@histoire/protocol'
import type { HistoireSession } from '@histoire/sdk/internal'
import { shallowRef } from 'vue'

/** Legacy folder keys are looked up from known tree paths, never parsed as story identity. */
export function createStandaloneFolders(session: HistoireSession, window: Window) {
  const expandedPaths = shallowRef<readonly string[][]>([])
  let values = new Map<string, boolean>()
  let storage: Storage | undefined
  let owner: string | undefined
  try {
    storage = window.localStorage
    values = new Map(JSON.parse(storage.getItem('_histoire-tree-state') ?? '[]'))
  }
  catch { /* Corrupt/blocked legacy preferences preserve usable folded navigation. */ }
  /** Reproject only currently known folders; catalog HMR cannot reveal unrelated storage keys. */
  function publish() {
    const paths: string[][] = []
    function walk(nodes: readonly HistoireCatalogTreeNode[], path: string[]) {
      for (const node of nodes) {
        if (node.kind === 'story') continue
        const full = node.kind === 'group' ? path : [...path, node.title]
        if (node.kind === 'folder' && values.get(full.join('␜'))) paths.push(full)
        walk(node.children, full)
      }
    }
    walk(session.getSnapshot().catalog.tree, [])
    expandedPaths.value = paths
  }
  /** Deep-link navigation opens each real ancestor and preserves standalone preference. */
  function synchronize() {
    const snapshot = session.getSnapshot()
    const identity = JSON.stringify([snapshot.source?.epoch, snapshot.source?.revision, snapshot.selection?.storyId])
    if (identity === owner) return
    owner = identity
    const story = snapshot.catalog.stories.find(story => story.id === snapshot.selection?.storyId)
    if (story) {
      for (let index = 1; index < story.path.length; index++) values.set(story.path.slice(0, index).join('␜'), true)
    }
    publish()
  }
  const close = session.subscribe(synchronize)
  synchronize()
  return { expandedPaths,
    /** Caller controls shared tree; embedded tree never receives storage provider. */
    toggle(value: { path: string[], open: boolean }) {
      values.set(value.path.join('␜'), value.open)
      publish()
      try {
        storage?.setItem('_histoire-tree-state', JSON.stringify([...values]))
      }
      catch { /* Persistence cannot block navigation. */ }
    }, close }
}
