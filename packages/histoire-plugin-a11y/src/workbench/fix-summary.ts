/** One requirement list of an axe failure summary. */
export interface FixSection {
  /** `all`: every item must be fixed; `any`: fixing one item is enough. */
  kind: 'all' | 'any'
  /** Requirements, one per line of the summary. */
  items: string[]
}

/** Affected element of a finding, as the bounded report carries it. */
export interface FixNode {
  /** Selector chain (frames first). */
  selectors: string[]
  /** Raw axe failure summary. */
  failureSummary?: string
}

/** Elements that share the same fix. */
export interface FixGroup<TNode extends FixNode = FixNode> {
  /** Parsed fix of every element of the group. */
  sections: FixSection[]
  /** Elements in report order. */
  nodes: TNode[]
}

// axe headings: "Fix all of the following:" / "Fix any of the following:".
const HEADING = /^Fix (all|any) of the following:$/i

/**
 * Splits an axe `failureSummary` into its "Fix all" / "Fix any" requirement lists.
 * Lines before any heading form an `all` list.
 * @param summary Raw summary; `undefined` reads as no requirement.
 */
export function parseFailureSummary(summary: string | undefined): FixSection[] {
  const sections: FixSection[] = []
  let current: FixSection | undefined
  for (const raw of summary?.split('\n') ?? []) {
    const line = raw.trim()
    if (!line) continue
    const heading = HEADING.exec(line)
    if (heading) {
      sections.push(current = { kind: heading[1].toLowerCase() as FixSection['kind'], items: [] })
      continue
    }
    if (!current) sections.push(current = { kind: 'all', items: [] })
    current.items.push(line)
  }
  return sections.filter(section => section.items.length)
}

/**
 * Groups elements with an identical failure summary, so a shared fix shows once.
 * Groups keep the order in which their first element appears.
 * @param nodes Affected elements of one finding.
 */
export function groupNodesByFix<TNode extends FixNode>(nodes: readonly TNode[]): FixGroup<TNode>[] {
  const groups = new Map<string, FixGroup<TNode>>()
  for (const node of nodes) {
    const key = node.failureSummary?.trim() ?? ''
    let group = groups.get(key)
    if (!group) groups.set(key, group = { sections: parseFailureSummary(node.failureSummary), nodes: [] })
    group.nodes.push(node)
  }
  return [...groups.values()]
}
