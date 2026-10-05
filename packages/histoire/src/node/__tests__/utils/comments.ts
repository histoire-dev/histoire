import type { HistoireCatalogStory } from '@histoire/protocol'
import type { UiComment, UiCommentDraft, UiCommentMessage } from '@histoire/shared'
import { randomUUID } from 'node:crypto'

/** One valid target fixture keeps punctuation opaque across client/server tests. */
export function commentDraft(body = 'Keep width while loading'): UiCommentDraft {
  return { id: randomUUID(), storyId: 'button:one', variantId: 'loading:small', anchor: { selector: '[data-test-id="loading"]', x: 10, y: 20 }, props: { size: 'sm' }, body }
}

/** Persisted counterpart adds only server-owned lifecycle fields. */
export function commentFixture(overrides: Partial<UiComment> = {}): UiComment {
  return { ...commentDraft(), status: 'draft', thread: [], createdAt: '2026-10-03T10:00:00.000Z', updatedAt: '2026-10-03T10:00:00.000Z', ...overrides }
}

/** Bounded history fixtures share timestamp and validated message shape across store/channel tests. */
export function commentMessages(count: number, body = 'Continue', author: UiCommentMessage['author'] = 'user'): UiCommentMessage[] {
  return Array.from({ length: count }, () => ({ author, body, at: '2026-10-03T10:00:00.000Z' }))
}

/** Matching collected target supports known/orphan grouping and logical pin tests. */
export const commentStory: HistoireCatalogStory = { id: 'button:one', title: 'Button', path: ['Actions', 'Button'], docsOnly: false, variants: [{ id: 'loading:small', title: 'Loading' }], content: { docs: false, rawSource: true } }
