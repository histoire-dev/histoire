import type { HistoireCatalogStory } from '@histoire/protocol'
import type { UiComment } from '@histoire/shared'

/** Local rail filters never delete resolved or orphan annotations. */
export type CommentsFilter = 'open' | 'resolved' | 'all'

/** One story's annotation group, including removed catalog targets. */
export interface CommentsGroup {
  /** Exact story identity. */
  storyId: string
  /** Folder path/title or orphan identity. */
  title: string
  /** Removed target remains reviewable and deletable. */
  orphaned: boolean
  /** Original file ordering within this story. */
  comments: UiComment[]
}

/** Filter only lifecycle; a removed story does not remove its saved thread. */
export function filterComments(comments: readonly UiComment[], filter: CommentsFilter): UiComment[] {
  return comments.filter(comment => filter === 'all' || (filter === 'resolved' ? comment.status === 'resolved' : comment.status !== 'resolved'))
}

/** Group known and orphan targets while preserving persisted chronological ordering. */
export function groupComments(comments: readonly UiComment[], stories: readonly HistoireCatalogStory[]): CommentsGroup[] {
  const groups = new Map<string, CommentsGroup>()
  for (const comment of comments) {
    const story = stories.find(story => story.id === comment.storyId)
    const orphaned = !story || !story.variants.some(variant => variant.id === comment.variantId)
    const key = JSON.stringify([comment.storyId, orphaned])
    let group = groups.get(key)
    if (!group) {
      group = { storyId: comment.storyId, title: story ? story.path.join(' / ') || story.title : comment.storyId, orphaned, comments: [] }
      groups.set(key, group)
    }
    group.comments.push(comment)
  }
  return [...groups.values()]
}

/** Compact timestamps keep actual time accessible through native title text. */
export function commentAge(date: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(date)) / 60_000))
  return minutes < 1 ? 'now' : minutes < 60 ? `${minutes}m` : minutes < 1440 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 1440)}d`
}

/** Stable attribute the runtime puts on every story render root. */
const STORY_ROOT_SELECTOR = '[data-test-id="sandbox-render"]'

/** Anchor selector split so story render root can show as a badge instead of raw attribute. */
export interface SelectorParts {
  /** Selector starts at the story render root. */
  storyRoot: boolean
  /** Remaining path below the root (or whole selector when not rooted). */
  path: string
}

/** Strip leading story root from inspection selectors; agents still receive the raw selector. */
export function selectorParts(selector: string): SelectorParts {
  if (!selector.startsWith(STORY_ROOT_SELECTOR)) return { storyRoot: false, path: selector }
  return { storyRoot: true, path: selector.slice(STORY_ROOT_SELECTOR.length).replace(/^\s*>\s*/, '') }
}

/** Keep only deepest selector segments; full selector stays available as native title. */
export function compactSelectorPath(path: string, keep = 2): string {
  const segments = path.split(/\s*>\s*/).filter(Boolean)
  return segments.length > keep ? ['…', ...segments.slice(-keep)].join(' > ') : segments.join(' > ')
}

/** Short display form of one captured prop value; nested data collapses to its shape. */
function propValueLabel(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.length > 24 ? `${value.slice(0, 24)}…` : value)
  if (Array.isArray(value)) return `[${value.length}]`
  if (value && typeof value === 'object') return '{…}'
  return String(value)
}

/** Captured prop context as `key: value` lines; per-component props (`componentProps[index]`) are flattened. */
export function propsSummary(props: Record<string, unknown> | undefined): string[] {
  const { componentProps, ...state } = props ?? {}
  const components = componentProps && typeof componentProps === 'object' ? Object.values(componentProps as Record<string, unknown>) : []
  const entries = [...Object.entries(state), ...components.flatMap(values => values && typeof values === 'object' ? Object.entries(values) : [])]
  return entries.map(([key, value]) => `${key}: ${propValueLabel(value)}`)
}
