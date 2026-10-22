import type { UiPinnedAiThread } from '@histoire/shared'
import { mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { commentAgentContext, commentPrompt } from '../ai-threads/prompt.js'
import { attachmentExists, saveAttachment } from '../comments/attachments.js'
import { writeCommentsFile } from '../comments/file.js'
import { createCommentsStore } from '../comments/store.js'
import { commentFixture, commentDraft as draft, PNG_BYTES } from './utils/comments.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'
import { deferred } from './utils/mcp/deferred.js'

afterEach(disposeConfigProjects)

describe('persisted threads', () => {
  it('creates files lazily and serializes concurrent stores without losing drafts', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    const first = createCommentsStore({ root, file: '.histoire/threads.json', enabled: true })
    const second = createCommentsStore({ root, file: '.histoire/threads.json', enabled: true })
    try {
      expect(await first.list()).toEqual([])
      await expect(stat(join(root, '.histoire'))).rejects.toMatchObject({ code: 'ENOENT' })
      const drafts = [draft('First'), draft('Second')]
      await Promise.all([first.upsert(drafts[0]), second.upsert(drafts[1])])
      const expected = drafts.map(({ id, body }) => ({ id, body, status: 'draft', thread: [] })).sort((left, right) => left.id.localeCompare(right.id))
      const saved = await first.list()
      expect(saved).toHaveLength(drafts.length)
      expect(saved.map(({ id, body, status, thread }) => ({ id, body, status, thread })).sort((left, right) => left.id.localeCompare(right.id))).toEqual(expected)
      const persisted = JSON.parse(await readFile(join(root, '.histoire/threads.json'), 'utf8'))
      expect(persisted.version).toBe(1)
      expect(persisted.threads.map(({ id, body, status, thread }: typeof saved[number]) => ({ id, body, status, thread })).sort((left: typeof expected[number], right: typeof expected[number]) => left.id.localeCompare(right.id))).toEqual(expected)
      await first.resolve(drafts[0].id, true)
      await second.resolve(drafts[0].id, false)
      expect((await first.list()).find(comment => comment.id === drafts[0].id)?.status).toBe('draft')
      await first.remove(drafts[1].id)
      expect(await second.list()).toHaveLength(1)
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('never reads or writes disabled storage and rejects path escapes', async () => {
    const disabled = createCommentsStore({ root: '/missing-project', file: '.histoire/threads.json', enabled: false })
    expect(await disabled.list()).toEqual([])
    await expect(disabled.upsert(draft())).rejects.toThrow('Comments are disabled')
    await expect(disabled.send([draft().id], 'agent', async () => ({ text: 'Completed' }))).rejects.toThrow('Comments are disabled')
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    try {
      await expect(createCommentsStore({ root, file: '../outside.json', enabled: true }).list()).rejects.toThrow('AI threads file must stay inside project')
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('sends drafts in order, preserves orphan targets, and appends replies and changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    const store = createCommentsStore({ root, file: '.histoire/threads.json', enabled: true })
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
      expect(await store.list()).toMatchObject([{ status: 'replied', context: first.context, thread: [{ author: 'agent', body: 'Fixed width', changes: [{ file: 'src/Button.vue' }] }] }, { status: 'replied' }])
      expect(commentAgentContext((await store.list())[0] as UiPinnedAiThread, 'src/Button.story.vue')).toMatchObject({ source: 'src/Button.story.vue', props: { size: 'sm' } })
      expect(commentPrompt((await store.list())[0] as UiPinnedAiThread, [])).not.toContain('src/Button.story.vue')
      expect(commentPrompt((await store.list())[0] as UiPinnedAiThread, [])).toContain('First')
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('returns failed agent requests to draft and records recoverable error in thread', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    const store = createCommentsStore({ root, file: '.histoire/threads.json', enabled: true })
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
      const store = createCommentsStore({ root, file: '.histoire/threads.json', enabled: true })
      await expect(store.upsert(draft())).rejects.toThrow('AI threads path cannot contain symlinks')
      await expect(stat(join(outside, 'threads.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
    finally {
      await rm(root, { recursive: true, force: true })
      await rm(outside, { recursive: true, force: true })
    }
  })

  it('deduplicates in-flight sends and preserves resolution while agent replies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    const store = createCommentsStore({ root, file: '.histoire/threads.json', enabled: true })
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
      // Reopening keeps the agent's answer as current status instead of "not sent".
      await store.resolve(value.id, false)
      expect(await store.list()).toMatchObject([{ status: 'replied' }])
      await store.reply(value.id, 'Follow up')
      await store.resolve(value.id, true)
      await store.resolve(value.id, false)
      expect(await store.list()).toMatchObject([{ status: 'draft' }])
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('recovers interrupted work and stale reopened drafts to their idle status', async () => {
    const root = await mkdtemp(join(tmpdir(), 'histoire-comments-'))
    const store = createCommentsStore({ root, file: '.histoire/threads.json', enabled: true })
    const reply = { author: 'agent' as const, agentId: 'agent', body: 'Done', at: '2026-10-03T10:00:00.000Z' }
    try {
      await writeCommentsFile(root, '.histoire/threads.json', [
        commentFixture({ status: 'working', thread: [reply] }),
        commentFixture({ status: 'draft', thread: [reply] }),
        commentFixture({ status: 'draft', thread: [{ ...reply, failed: true }] }),
      ])
      await store.recover()
      expect((await store.list()).map(comment => comment.status).sort()).toEqual(['draft', 'replied', 'replied'])
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('deletes attachment files of a removed comment and its replies', async () => {
    const { root } = await configTestProject()
    const store = createCommentsStore({ root, file: '.histoire/threads.json', enabled: true })
    const [first, reply] = await Promise.all(['a.png', 'b.png'].map(name => saveAttachment(root, name, 'image/png', PNG_BYTES)))
    const value = { ...draft(), attachments: [first] }
    await store.upsert(value)
    await store.reply(value.id, 'More', [reply])
    await store.remove(value.id)
    expect(await Promise.all([first, reply].map(file => attachmentExists(root, file)))).toEqual([false, false])
  })

  it('deletes a detached upload but keeps one another message still references', async () => {
    const { root } = await configTestProject()
    const store = createCommentsStore({ root, file: '.histoire/threads.json', enabled: true })
    const [shared, own] = await Promise.all(['shared.png', 'own.png'].map(name => saveAttachment(root, name, 'image/png', PNG_BYTES)))
    const value = { ...draft(), attachments: [shared, own] }
    const other = draft()
    await store.upsert(value)
    await store.upsert(other)
    await store.reply(other.id, 'Same file', [shared])
    await store.upsert({ ...value, attachments: [] })
    expect(await attachmentExists(root, own)).toBe(false)
    expect(await attachmentExists(root, shared)).toBe(true)
  })
})
