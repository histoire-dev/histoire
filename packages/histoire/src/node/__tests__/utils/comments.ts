import type { HistoireCatalogStory } from '@histoire/protocol'
import type { UiAiThread, UiAiThreadDraft, UiCommentAttachment, UiCommentMessage } from '@histoire/shared'
import { randomUUID } from 'node:crypto'

/** Pinned thread draft (a canvas comment) on one valid target; punctuation stays opaque across client/server tests. */
export function commentDraft(body = 'Keep width while loading'): UiAiThreadDraft {
  return { id: randomUUID(), context: { storyId: 'button:one', variantId: 'loading:small' }, anchor: { selector: '[data-test-id="loading"]', x: 10, y: 20 }, props: { size: 'sm' }, body }
}

/** Persisted pinned thread: the draft plus server-owned title and lifecycle fields. */
export function commentFixture(overrides: Partial<UiAiThread> = {}): UiAiThread {
  const draft = commentDraft(overrides.body)
  return { ...draft, title: draft.body.split('\n')[0], status: 'draft', thread: [], createdAt: '2026-10-03T10:00:00.000Z', updatedAt: '2026-10-03T10:00:00.000Z', ...overrides }
}

/** Bounded history fixtures share timestamp and validated message shape across store/channel tests. */
export function commentMessages(count: number, body = 'Continue', author: UiCommentMessage['author'] = 'user'): UiCommentMessage[] {
  return Array.from({ length: count }, () => ({ author, body, at: '2026-10-03T10:00:00.000Z' }))
}

/** Matching collected target supports known/orphan grouping and logical pin tests. */
export const commentStory: HistoireCatalogStory = { id: 'button:one', title: 'Button', path: ['Actions', 'Button'], docsOnly: false, variants: [{ id: 'loading:small', title: 'Loading' }], content: { docs: false, rawSource: true } }

/** Smallest valid PNG signature; enough for image type detection. */
export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

/** Stored attachment reference as returned by an upload. */
export function commentAttachment(overrides: Partial<UiCommentAttachment> = {}): UiCommentAttachment {
  return { path: '.histoire/attachments/00000000-0000-0000-0000-000000000000-a.png', name: 'a.png', mimeType: 'image/png', size: 3, ...overrides }
}
