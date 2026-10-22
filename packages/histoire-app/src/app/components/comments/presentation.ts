import type { HistoireCatalogStory } from '@histoire/protocol'
import type { UiAiThread } from '@histoire/shared'
import { isPinnedThread } from '@histoire/shared'

/**
 * Pin numbers: ordinals among pinned threads in persisted order, shared by canvas pins and list rows.
 * @param threads Persisted threads in file order.
 */
export function pinNumbers(threads: readonly UiAiThread[]): Map<string, number> {
  return new Map(threads.filter(isPinnedThread).map((thread, index) => [thread.id, index + 1]))
}

/**
 * Whether a pinned thread's variant still exists, so it can open on the canvas.
 * Orphans (story or variant removed) open in the pane instead.
 * @param thread Thread to check.
 * @param stories Collected catalog stories.
 */
export function isOnCanvas(thread: UiAiThread, stories: readonly HistoireCatalogStory[]): boolean {
  return isPinnedThread(thread) && stories.some(story => story.id === thread.context.storyId && story.variants.some(variant => variant.id === thread.context.variantId))
}

/** Thread list section. */
export interface ThreadGroup {
  /** Section heading. */
  title: string
  /** Threads in list order. */
  threads: UiAiThread[]
}

/**
 * Threads of the selected story first, then the rest of the project; empty groups are dropped.
 * @param threads Visible threads in list order.
 * @param storyId Selected story, if any.
 */
export function groupThreads(threads: readonly UiAiThread[], storyId: string | undefined): ThreadGroup[] {
  const story = threads.filter(thread => storyId !== undefined && thread.context?.storyId === storyId)
  const project = threads.filter(thread => !story.includes(thread))
  return [{ title: 'This story', threads: story }, { title: 'Project', threads: project }].filter(group => group.threads.length)
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
