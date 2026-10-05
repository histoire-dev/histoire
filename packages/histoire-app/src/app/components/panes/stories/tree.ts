import type { HistoireCatalog, HistoireCatalogStory, HistoireCatalogTreeNode, HistoireTarget } from '@histoire/protocol'

/** One visible tree row; groups remain headings outside keyboard navigation. */
export interface StoryTreeRow {
  /** Exact local row identity, safe when labels contain separators. */
  key: string
  /** Catalog kind plus selected story's variant children. */
  kind: 'group' | 'folder' | 'story' | 'variant'
  /** Configured tree/variant display label. */
  title: string
  /** Zero-based visual and ARIA indentation. */
  depth: number
  /** Closest keyboard-navigable ancestor. */
  parent?: string
  /** Exact canonical activation identity. */
  target?: HistoireTarget | { storyId: string }
  /** Catalog metadata used for count, color, and diagnostics. */
  story?: HistoireCatalogStory
  /** Real legacy folder path; groups do not contribute segments. */
  path?: string[]
  /** Expanded folders and current story advertise visible children. */
  expanded?: boolean
  /** Selected variant, or selected docs-only story. */
  selected?: boolean
}

/** Project visible catalog rows without mutating caller's persisted folder state. */
export function createStoryTreeRows(catalog: HistoireCatalog, selection: HistoireTarget | null, expandedPaths: readonly (readonly string[])[], currentStoryOpen = true): StoryTreeRow[] {
  const stories = new Map(catalog.stories.map(story => [story.id, story]))
  const expanded = new Set(expandedPaths.map(path => JSON.stringify(path)))
  const rows: StoryTreeRow[] = []
  /** Groups preserve source order but do not add indentation or folder storage keys. */
  function walk(nodes: readonly HistoireCatalogTreeNode[], path: string[], depth: number, parent?: string, groupKey = ''): void {
    for (const node of nodes) {
      if (node.kind === 'group') {
        const key = JSON.stringify(['group', groupKey, node.id ?? node.title])
        // Unnamed groups structure the catalog but own no visible heading or row.
        if (node.title.trim()) rows.push({ key, kind: 'group', title: node.title, depth })
        walk(node.children, path, depth, parent, key)
      }
      else if (node.kind === 'folder') {
        const full = [...path, node.title]
        const key = JSON.stringify(['folder', groupKey, full])
        const open = expanded.has(JSON.stringify(full))
        rows.push({ key, kind: 'folder', title: node.title, depth, parent, path: full, expanded: open })
        if (open) walk(node.children, full, depth + 1, key, groupKey)
      }
      else if (node.kind === 'story') {
        const story = stories.get(node.storyId)
        if (!story) continue
        const key = JSON.stringify(['story', node.storyId])
        const active = selection?.storyId === story.id
        rows.push({ key, kind: 'story', title: node.title, depth, parent, story, target: { storyId: story.id }, selected: active && story.docsOnly, expanded: story.docsOnly || !story.variants.length ? undefined : active && currentStoryOpen })
        if (!active || story.docsOnly || !currentStoryOpen) continue
        for (const variant of story.variants) {
          rows.push({ key: JSON.stringify(['variant', story.id, variant.id]), kind: 'variant', title: variant.title, depth: depth + 1, parent: key, story, target: { storyId: story.id, variantId: variant.id }, selected: selection?.variantId === variant.id })
        }
      }
    }
  }
  walk(catalog.tree, [], 0)
  return rows
}

/** Keyboard focus never wraps outside tree; Left and Right follow real visible ancestry. */
export function nextTreeFocus(rows: readonly StoryTreeRow[], key: string, pressed: string): string {
  const index = rows.findIndex(row => row.key === key)
  const row = rows[index]
  if (!row) return rows[0]?.key ?? key
  if (pressed === 'Home') return rows[0].key
  if (pressed === 'End') return rows[rows.length - 1].key
  if (pressed === 'ArrowDown') return rows[Math.min(index + 1, rows.length - 1)].key
  if (pressed === 'ArrowUp') return rows[Math.max(index - 1, 0)].key
  if (pressed === 'ArrowLeft') return row.parent ?? key
  if (pressed === 'ArrowRight' && rows[index + 1]?.parent === key) return rows[index + 1].key
  return key
}
