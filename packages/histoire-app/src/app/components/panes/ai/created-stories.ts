/** Catalog fields needed to link a story. */
export interface LinkableStory {
  /** Story identity. */
  id: string
  /** Display title. */
  title: string
  /** Project-relative story file. */
  relativePath?: string
}

/**
 * Normalize an agent-reported path for comparison with catalog labels.
 * @param file Project-relative path, possibly prefixed with `./`.
 */
function normalize(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '')
}

/**
 * Stories whose files an agent changed, deduplicated in change order. Files
 * appear only once the watcher collected them, so callers stay reactive on the catalog.
 * @param changes Agent-reported file edits.
 * @param stories Collected catalog stories.
 */
export function createdStories<T extends LinkableStory>(changes: readonly { file: string }[], stories: readonly T[]): T[] {
  const byPath = new Map(stories.filter(story => story.relativePath).map(story => [normalize(story.relativePath!), story]))
  const found = new Set<T>()
  for (const change of changes) {
    const story = byPath.get(normalize(change.file))
    if (story) found.add(story)
  }
  return [...found]
}
