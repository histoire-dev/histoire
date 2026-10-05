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
