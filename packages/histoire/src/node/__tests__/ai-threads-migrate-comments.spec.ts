import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateComments } from '../ai-threads/migrate-comments.js'
import { readCommentsFile, writeCommentsFile } from '../comments/file.js'
import { commentFixture } from './utils/comments.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

afterEach(disposeConfigProjects)

/**
 * Legacy `comments.json` record: target and pin fields at top level, no title nor context.
 * @param thread Pinned thread fixture to convert back.
 */
function legacyComment(thread: ReturnType<typeof commentFixture>) {
  const { title: _title, context, ...rest } = thread
  return { ...rest, storyId: context!.storyId, variantId: context!.variantId }
}

/**
 * Write a legacy comments document.
 * @param root Project root.
 * @param comments Raw persisted records.
 */
async function writeLegacy(root: string, comments: unknown[]) {
  await mkdir(join(root, '.histoire'), { recursive: true })
  await writeFile(join(root, '.histoire/comments.json'), JSON.stringify({ version: 1, comments }))
}

describe('canvas comments migration', () => {
  it('imports comments as pinned threads once, keeping existing threads and a renamed backup', async () => {
    const { root } = await configTestProject()
    const existing = commentFixture({ body: 'Already a thread' })
    const comment = commentFixture({ body: 'Keep width\nwhile loading', status: 'resolved', agentId: 'agent', options: { model: 'fast' }, screenshot: '.histoire/screenshots/a.png', thread: [{ author: 'agent', agentId: 'agent', body: 'Done', at: '2026-10-03T10:00:00.000Z' }] })
    await writeCommentsFile(root, '.histoire/threads.json', [existing])
    await writeLegacy(root, [legacyComment(existing), legacyComment(comment)])
    expect(await migrateComments(root, '.histoire/comments.json')).toBe(1)
    expect(await readCommentsFile(root, '.histoire/threads.json')).toEqual([existing, { ...comment, title: 'Keep width' }])
    await expect(stat(join(root, '.histoire/comments.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(JSON.parse(await readFile(join(root, '.histoire/comments.migrated.json'), 'utf8')).comments).toHaveLength(2)
    expect(await migrateComments(root, '.histoire/comments.json')).toBe(0)
    expect(await readCommentsFile(root, '.histoire/threads.json')).toHaveLength(2)
  })

  it('leaves a malformed source untouched and reports it', async () => {
    const { root } = await configTestProject()
    await writeLegacy(root, [{ id: 'nope' }])
    await expect(migrateComments(root, '.histoire/comments.json')).rejects.toThrow('.histoire/comments.json could not be imported')
    expect(await readFile(join(root, '.histoire/comments.json'), 'utf8')).toContain('nope')
    await expect(stat(join(root, '.histoire/threads.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
