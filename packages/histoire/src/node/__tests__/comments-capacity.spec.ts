import { symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { commentsFileBytes, writeCommentsFile } from '../comments/file.js'
import { COMMENT_AGENT_REPLY_BYTES, COMMENT_FILE_BYTE_LIMIT } from '../comments/limits.js'
import { createCommentsStore } from '../comments/store.js'
import { commentFixture, commentMessages } from './utils/comments.js'
import { deferred } from './utils/mcp/deferred.js'
import { createMcpProjectFixture } from './utils/mcp/project.js'

describe('comment delivery capacity', () => {
  /** Fill valid unrelated history while retaining precise physical-file headroom. */
  function commentsNearFileLimit(headroom: number) {
    const comments = [commentFixture()]
    while (true) {
      const next = commentFixture({ body: 'x'.repeat(8192) })
      if (commentsFileBytes([...comments, next]) > COMMENT_FILE_BYTE_LIMIT - headroom) break
      comments.push(next)
    }
    const filler = commentFixture({ body: 'x' })
    let lower = 1
    let upper = 8192
    while (lower < upper) {
      const middle = Math.ceil((lower + upper) / 2)
      if (commentsFileBytes([...comments, { ...filler, body: 'x'.repeat(middle) }]) <= COMMENT_FILE_BYTE_LIMIT - headroom) lower = middle
      else upper = middle - 1
    }
    return [...comments, { ...filler, body: 'x'.repeat(lower) }]
  }

  it('rejects aggregate file overflow before starting an otherwise valid agent reply', async () => {
    const fixture = await createMcpProjectFixture()
    const comments = commentsNearFileLimit(1024)
    const store = createCommentsStore({ root: fixture.root, file: '.histoire/comments.json', enabled: true })
    const runner = vi.fn(async () => ({ text: 'Completed outcome' }))
    try {
      await writeCommentsFile(fixture.root, '.histoire/comments.json', comments)
      await expect(store.send([comments[0].id], 'agent', runner)).rejects.toThrow('Comment reply capacity reached')
      expect(runner).not.toHaveBeenCalled()
      expect(await store.list()).toEqual(comments)
    }
    finally { await fixture.close() }
  })

  it('persists a bounded completed reply after aggregate file admission', async () => {
    const fixture = await createMcpProjectFixture()
    const comments = commentsNearFileLimit(COMMENT_AGENT_REPLY_BYTES + 8 * 1024)
    const store = createCommentsStore({ root: fixture.root, file: '.histoire/comments.json', enabled: true })
    try {
      await writeCommentsFile(fixture.root, '.histoire/comments.json', comments)
      await store.send([comments[0].id], 'agent', async (_comment, working) => {
        await working()
        return { text: '\u0001'.repeat(8192), changes: Array.from({ length: 32 }, () => ({ file: '\u0001'.repeat(512), added: Number.MAX_SAFE_INTEGER, removed: Number.MAX_SAFE_INTEGER })) }
      })
      const [saved] = await store.list()
      expect(saved).toMatchObject({ status: 'replied', thread: [{ author: 'agent', agentId: 'agent' }] })
      expect(saved.thread[0].body.length).toBeGreaterThan(0)
    }
    finally { await fixture.close() }
  })

  it.each(['physical', 'alias'])('keeps pending aggregate capacity reserved across $0 writers', async (mode) => {
    const fixture = await createMcpProjectFixture()
    const comments = commentsNearFileLimit(COMMENT_AGENT_REPLY_BYTES + 8 * 1024)
    const store = createCommentsStore({ root: fixture.root, file: '.histoire/comments.json', enabled: true })
    const alias = join(fixture.root, 'alias')
    if (mode === 'alias') await symlink(fixture.root, alias, 'dir')
    const other = createCommentsStore({ root: mode === 'alias' ? alias : fixture.root, file: '.histoire/comments.json', enabled: true })
    const started = deferred<void>()
    const finished = deferred<{ text: string }>()
    let sending: Promise<void> | undefined
    try {
      await writeCommentsFile(fixture.root, '.histoire/comments.json', comments)
      sending = store.send([comments[0].id], 'agent', async (_comment, working) => {
        await working()
        started.resolve()
        return finished.promise
      })
      await started.promise
      await expect(other.upsert(commentFixture({ body: 'y'.repeat(8192) }))).rejects.toThrow('Comment reply capacity reached')
      finished.resolve({ text: 'Completed outcome' })
      await sending
      expect((await store.list())[0]).toMatchObject({ status: 'replied', thread: [{ body: 'Completed outcome' }] })
    }
    finally {
      finished.resolve({ text: 'Completed outcome' })
      await sending?.catch(() => {})
      await store.close()
      await fixture.close()
    }
  })

  it('rejects before dispatch at the message limit without losing history or working forever', async () => {
    const fixture = await createMcpProjectFixture()
    const comment = commentFixture({ thread: commentMessages(63) })
    const store = createCommentsStore({ root: fixture.root, file: '.histoire/comments.json', enabled: true })
    const runner = vi.fn(async (_comment, working) => {
      await working()
      return { text: 'Completed' }
    })
    try {
      await writeCommentsFile(fixture.root, '.histoire/comments.json', [comment])
      await store.send([comment.id], 'agent', runner)
      await expect(store.send([comment.id], 'agent', runner)).rejects.toThrow('Comment reply capacity reached')
      expect(runner).toHaveBeenCalledTimes(1)
      expect(await store.list()).toMatchObject([{ status: 'replied', thread: [...comment.thread, { body: 'Completed' }] }])
    }
    finally { await fixture.close() }
  })

  it.each([
    { label: 'short', text: 'Completed', attempts: 34 },
    { label: '8192-character', text: 'x'.repeat(8192), attempts: 6 },
  ])('retains every completed $label reply and rejects capacity before the next dispatch', async ({ text, attempts }) => {
    const fixture = await createMcpProjectFixture()
    const comment = commentFixture()
    const store = createCommentsStore({ root: fixture.root, file: '.histoire/comments.json', enabled: true })
    const runner = vi.fn(async (_comment, working) => {
      await working()
      return { text }
    })
    try {
      await store.upsert(comment)
      let capacity: unknown
      for (let index = 0; index < attempts; index++) {
        try {
          await store.send([comment.id], 'agent', runner)
          await store.reply(comment.id, 'Continue')
        }
        catch (error) {
          capacity = error
          break
        }
      }
      const [saved] = await store.list()
      expect(capacity).toBeInstanceOf(Error)
      expect((capacity as Error).message).toContain('Comment reply capacity reached')
      expect(saved.status).toBe('draft')
      expect(saved.thread.filter(message => message.author === 'agent').map(message => message.body)).toEqual(Array.from({ length: runner.mock.calls.length }, () => text))
    }
    finally { await fixture.close() }
  })

  it('bounds successful escaped output with an explicit note instead of calling it agent failure', async () => {
    const fixture = await createMcpProjectFixture()
    const comment = commentFixture()
    const store = createCommentsStore({ root: fixture.root, file: '.histoire/comments.json', enabled: true })
    try {
      await store.upsert(comment)
      await store.send([comment.id], 'agent', async (_comment, working) => {
        await working()
        return { text: '\u0001'.repeat(8192) }
      })
      const [saved] = await store.list()
      expect(saved.status).toBe('replied')
      expect(saved.thread[0].body).toContain('Reply truncated to fit comment capacity.')
      expect(saved.thread[0].body).not.toContain('Agent request failed')
      expect(saved.thread[0].body.length).toBeLessThan(8192)
    }
    finally { await fixture.close() }
  })

  it.each(['physical', 'alias'])('preserves reserved capacity across $0 root when resolved and reopened during a pending reply', async (mode) => {
    const fixture = await createMcpProjectFixture()
    const comment = commentFixture({ thread: commentMessages(63) })
    const store = createCommentsStore({ root: fixture.root, file: '.histoire/comments.json', enabled: true })
    const alias = join(fixture.root, 'alias')
    if (mode === 'alias') await symlink(fixture.root, alias, 'dir')
    const other = createCommentsStore({ root: mode === 'alias' ? alias : fixture.root, file: '.histoire/comments.json', enabled: true })
    const started = deferred<void>()
    const finished = deferred<{ text: string }>()
    try {
      await writeCommentsFile(fixture.root, '.histoire/comments.json', [comment])
      const sending = store.send([comment.id], 'agent', async (_comment, working) => {
        await working()
        started.resolve()
        return finished.promise
      })
      await started.promise
      await store.resolve(comment.id, true)
      await store.resolve(comment.id, false)
      await expect(store.reply(comment.id, 'Fill pending history')).rejects.toThrow('Cannot reply while agent is working')
      await expect(other.reply(comment.id, 'Other client')).rejects.toThrow('Cannot reply while agent is working')
      finished.resolve({ text: 'Completed' })
      await sending
      expect(await store.list()).toMatchObject([{ status: 'replied', thread: [...comment.thread, { body: 'Completed' }] }])
    }
    finally {
      finished.resolve({ text: 'Completed' })
      await store.close()
      await fixture.close()
    }
  })

  it('settles failed delivery without requiring another message slot after an external history change', async () => {
    const fixture = await createMcpProjectFixture()
    const comment = commentFixture({ thread: commentMessages(63) })
    const store = createCommentsStore({ root: fixture.root, file: '.histoire/comments.json', enabled: true })
    try {
      await writeCommentsFile(fixture.root, '.histoire/comments.json', [comment])
      await store.send([comment.id], 'agent', async (_comment, working) => {
        await working()
        const [current] = await store.list()
        await writeCommentsFile(fixture.root, '.histoire/comments.json', [{ ...current, thread: [...current.thread, { author: 'user', body: 'External edit', at: '2026-10-04T10:00:00.000Z' }] }])
        throw new Error('Runner unavailable')
      })
      expect(await store.list()).toMatchObject([{ status: 'draft', thread: [...comment.thread, { body: 'External edit' }] }])
    }
    finally { await fixture.close() }
  })
})
