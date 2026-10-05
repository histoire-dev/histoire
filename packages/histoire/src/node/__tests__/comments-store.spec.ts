import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { commentAgentContext, commentPrompt } from '../comments/prompt.js'
import { createCommentsStore } from '../comments/store.js'
import { commentDraft as draft } from './utils/comments.js'
import { deferred } from './utils/mcp/deferred.js'

describe('persisted canvas comments', () => {
  it('creates files lazily and serializes concurrent stores without losing drafts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    const first = createCommentsStore({ root, file: '.histoire/comments.json', enabled: true })
    const second = createCommentsStore({ root, file: '.histoire/comments.json', enabled: true })
    try {
      expect(await first.list()).toEqual([])
      await expect(stat(join(root, '.histoire'))).rejects.toMatchObject({ code: 'ENOENT' })
      const drafts = [draft('First'), draft('Second')]
      await Promise.all([first.upsert(drafts[0]), second.upsert(drafts[1])])
      const expected = drafts.map(({ id, body }) => ({ id, body, status: 'draft', thread: [] })).sort((left, right) => left.id.localeCompare(right.id))
      const saved = await first.list()
      expect(saved).toHaveLength(drafts.length)
      expect(saved.map(({ id, body, status, thread }) => ({ id, body, status, thread })).sort((left, right) => left.id.localeCompare(right.id))).toEqual(expected)
      const persisted = JSON.parse(await readFile(join(root, '.histoire/comments.json'), 'utf8'))
      expect(persisted.version).toBe(1)
      expect(persisted.comments.map(({ id, body, status, thread }: typeof saved[number]) => ({ id, body, status, thread })).sort((left: typeof expected[number], right: typeof expected[number]) => left.id.localeCompare(right.id))).toEqual(expected)
      await first.resolve(drafts[0].id, true)
      await second.resolve(drafts[0].id, false)
      expect((await first.list()).find(comment => comment.id === drafts[0].id)?.status).toBe('draft')
      await first.remove(drafts[1].id)
      expect(await second.list()).toHaveLength(1)
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('never reads or writes disabled storage and rejects path escapes', async () => {
    const disabled = createCommentsStore({ root: '/missing-project', file: '.histoire/comments.json', enabled: false })
    expect(await disabled.list()).toEqual([])
    await expect(disabled.upsert(draft())).rejects.toThrow('Comments are disabled')
    await expect(disabled.send([draft().id], 'agent', async () => ({ text: 'Completed' }))).rejects.toThrow('Comments are disabled')
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    try {
      await expect(createCommentsStore({ root, file: '../outside.json', enabled: true }).list()).rejects.toThrow('Comments file must stay inside project')
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('sends drafts in order, preserves orphan targets, and appends replies and changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    const store = createCommentsStore({ root, file: '.histoire/comments.json', enabled: true })
    const first = draft('First')
    const second = draft('Second')
    const seen: string[] = []
    try {
      await store.upsert(first)
      await store.upsert(second)
      await store.send([first.id, second.id], 'agent', async (comment, working) => {
        seen.push(comment.body)
        await working()
        expect((await store.list()).find(value => value.id === comment.id)?.status).toBe('working')
        return { text: 'Fixed width', changes: [{ file: 'src/Button.vue', added: 2, removed: 1 }] }
      })
      expect(seen).toEqual(['First', 'Second'])
      expect(await store.list()).toMatchObject([{ status: 'replied', storyId: first.storyId, thread: [{ author: 'agent', body: 'Fixed width', changes: [{ file: 'src/Button.vue' }] }] }, { status: 'replied' }])
      expect(commentAgentContext((await store.list())[0], 'src/Button.story.vue')).toMatchObject({ source: 'src/Button.story.vue', props: { size: 'sm' } })
      expect(commentPrompt((await store.list())[0])).not.toContain('src/Button.story.vue')
      expect(commentPrompt((await store.list())[0])).toContain('First')
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('returns failed agent requests to draft and records recoverable error in thread', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    const store = createCommentsStore({ root, file: '.histoire/comments.json', enabled: true })
    const value = draft()
    try {
      await store.upsert(value)
      await store.send([value.id], 'agent', async () => {
        throw new Error('Agent unavailable')
      })
      expect(await store.list()).toMatchObject([{ status: 'draft', thread: [{ author: 'agent', body: 'Agent request failed. Retry after checking the agent.' }] }])
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('rejects symlink parents without writing outside the captured project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    const outside = await mkdtemp(join(tmpdir(), 'histoire-comments-outside-'))
    try {
      await symlink(outside, join(root, '.histoire'), 'dir')
      const store = createCommentsStore({ root, file: '.histoire/comments.json', enabled: true })
      await expect(store.upsert(draft())).rejects.toThrow('Comments path cannot contain symlinks')
      await expect(stat(join(outside, 'comments.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
    finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('deduplicates in-flight sends and preserves resolution while agent replies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    const store = createCommentsStore({ root, file: '.histoire/comments.json', enabled: true })
    const value = draft()
    const started = deferred<void>()
    const finish = deferred<{ text: string }>()
    let calls = 0
    try {
      await store.upsert(value)
      const runner = async () => {
        calls++
        started.resolve()
        return finish.promise
      }
      const first = store.send([value.id], 'agent', runner)
      const second = store.send([value.id], 'agent', runner)
      await started.promise
      await store.resolve(value.id, true)
      finish.resolve({ text: 'Done' })
      await Promise.all([first, second])
      expect(calls).toBe(1)
      expect(await store.list()).toMatchObject([{ status: 'resolved', thread: [{ body: 'Done' }] }])
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })
})
