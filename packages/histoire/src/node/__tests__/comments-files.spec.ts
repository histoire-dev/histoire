import { mkdir, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { dirname, join } from 'pathe'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiThreadsCodec } from '../ai-threads/validate.js'
import { sweepAttachments } from '../comments/attachments-sweep.js'
import { attachmentExists, readAttachment, saveAttachment } from '../comments/attachments.js'
import { writeCommentsFile } from '../comments/file.js'
import { listProjectFiles, searchProjectFiles } from '../comments/files-search.js'
import { commentPromptFiles, extractMentions, isCommentCommand } from '../comments/prompt.js'
import { commentFixture, PNG_BYTES } from './utils/comments.js'
import { configTestProject, disposeConfigProjects } from './utils/config-codemod.js'

/** Scratch project root, removed after each test. */
async function project() {
  return (await configTestProject()).root
}

afterEach(async () => {
  vi.unstubAllEnvs()
  await disposeConfigProjects()
})

describe('comment file mentions', () => {
  it('ranks basename matches before directory matches and shorter paths first', () => {
    const files = ['src/button/index.ts', 'src/components/Button.vue', 'docs/button.md', 'src/deep/nested/Button.vue', 'src/ui/ButtonGroup.vue', 'src/bt/other.ts']
    expect(searchProjectFiles(files, 'button', 4).map(file => file.path)).toEqual(['docs/button.md', 'src/components/Button.vue', 'src/deep/nested/Button.vue', 'src/ui/ButtonGroup.vue'])
    expect(searchProjectFiles(files, 'btngrp', 5).map(file => file.path)).toEqual(['src/ui/ButtonGroup.vue'])
    expect(searchProjectFiles(files, '', 2)[0]).toEqual({ path: 'docs/button.md', basename: 'button.md', dirname: 'docs' })
  })

  it('walks projects without git, skipping dependencies and hidden folders', async () => {
    const root = await project()
    // Stop git discovery above the scratch root, so the filesystem fallback really runs.
    vi.stubEnv('GIT_CEILING_DIRECTORIES', dirname(root))
    await mkdir(join(root, 'src'))
    await mkdir(join(root, 'node_modules/pkg'), { recursive: true })
    await mkdir(join(root, '.histoire'))
    await Promise.all([writeFile(join(root, 'src/a.ts'), ''), writeFile(join(root, 'node_modules/pkg/b.js'), ''), writeFile(join(root, '.histoire/c.json'), '')])
    expect(await listProjectFiles(root)).toEqual(['src/a.ts'])
  })

  it('keeps only mentions of indexed files', () => {
    const files = new Set(['src/a.ts', 'src/b.vue'])
    expect(extractMentions('Look at @src/a.ts, and @src/b.vue. Not @missing.ts or me@src/a.ts', files)).toEqual(['src/a.ts', 'src/b.vue'])
  })

  it('flags files of earlier messages, keeping the latest message files unflagged', () => {
    const files = new Set(['src/a.ts', 'src/b.ts'])
    const first = { path: '.histoire/attachments/00000000-0000-0000-0000-000000000001-a.png', name: 'a.png', mimeType: 'image/png', size: 8 }
    const second = { ...first, path: '.histoire/attachments/00000000-0000-0000-0000-000000000002-b.png', name: 'b.png' }
    const comment = commentFixture({ body: 'See @src/a.ts', attachments: [first], thread: [
      { author: 'agent', body: 'Mention @src/b.ts', at: '2026-10-03T10:00:00.000Z' },
      { author: 'user', body: 'Now @src/b.ts and again @src/a.ts', at: '2026-10-03T10:00:00.000Z', attachments: [second] },
    ] })
    expect(commentPromptFiles(comment, files)).toEqual([
      { path: first.path, name: 'a.png', mimeType: 'image/png', earlier: true },
      { path: second.path, name: 'b.png', mimeType: 'image/png' },
      { path: 'src/b.ts' },
      { path: 'src/a.ts' },
    ])
    expect(commentPromptFiles(commentFixture({ body: '@src/a.ts' }), files)).toEqual([{ path: 'src/a.ts' }])
  })

  it('treats a leading slash as a command only when the agent announced it', () => {
    expect(isCommentCommand(commentFixture({ body: '/review now' }), ['review'])).toBe(true)
    expect(isCommentCommand(commentFixture({ body: '/api returns 500' }), ['review'])).toBe(false)
    expect(isCommentCommand(commentFixture({ body: '/review' }), [])).toBe(false)
  })
})

describe('comment attachments', () => {
  it('stores verified images and serves them back by generated name only', async () => {
    const root = await project()
    const saved = await saveAttachment(root, '../../evil name.png', 'text/html', PNG_BYTES)
    expect(saved).toMatchObject({ name: 'evil name.png', mimeType: 'image/png', size: PNG_BYTES.byteLength })
    expect(saved.path).toMatch(/^\.histoire\/attachments\/[a-f0-9-]{36}-evil-name\.png$/)
    const name = saved.path.split('/').pop()!
    expect((await readAttachment(root, name))?.mimeType).toBe('image/png')
    expect(await readAttachment(root, '../comments.json')).toBeUndefined()
    expect(await attachmentExists(root, saved)).toBe(true)
    expect(await attachmentExists(root, { ...saved, path: '.histoire/attachments/../comments.json' })).toBe(false)
  })

  it('downgrades unknown types and rejects oversized files and symlinked folders', async () => {
    const root = await project()
    expect((await saveAttachment(root, 'page.html', 'text/html', new TextEncoder().encode('<script>'))).mimeType).toBe('application/octet-stream')
    expect((await saveAttachment(root, 'notes.md', 'text/markdown', new TextEncoder().encode('# hi'))).mimeType).toBe('text/markdown')
    await expect(saveAttachment(root, 'big.bin', '', new Uint8Array(10 * 1024 * 1024 + 1))).rejects.toThrow('10 MB')
    const other = await project()
    await rm(join(root, '.histoire/attachments'), { recursive: true })
    await symlink(other, join(root, '.histoire/attachments'))
    await expect(saveAttachment(root, 'a.png', 'image/png', PNG_BYTES)).rejects.toThrow('symlink')
    expect(await readdir(other)).toEqual([])
  })
})

describe('orphan attachment sweep', () => {
  it('deletes only old unreferenced generated uploads', async () => {
    const root = await project()
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000)
    const [orphan, referenced, fresh] = await Promise.all(['orphan.png', 'kept.png', 'fresh.png'].map(name => saveAttachment(root, name, 'image/png', PNG_BYTES)))
    const directory = join(root, '.histoire/attachments')
    await writeFile(join(directory, 'notes.txt'), 'user file')
    await Promise.all([orphan, referenced].map(file => utimes(join(root, file.path), old, old)))
    await utimes(join(directory, 'notes.txt'), old, old)
    await writeCommentsFile(root, '.histoire/threads.json', [commentFixture({ thread: [{ author: 'user', body: 'Here', at: '2026-10-03T10:00:00.000Z', attachments: [referenced] }] })])
    const sources = [{ file: '.histoire/threads.json', codec: aiThreadsCodec }]
    expect(await sweepAttachments(root, sources)).toEqual([orphan.path.split('/').pop()])
    expect((await readdir(directory)).sort()).toEqual([fresh, referenced].map(file => file.path.split('/').pop()).concat('notes.txt').sort())
  })

  it('aborts without deleting when a conversation file is unreadable', async () => {
    const root = await project()
    const orphan = await saveAttachment(root, 'orphan.png', 'image/png', PNG_BYTES)
    await writeFile(join(root, '.histoire/threads.json'), '{ corrupt')
    await expect(sweepAttachments(root, [{ file: '.histoire/threads.json', codec: aiThreadsCodec }], 0)).rejects.toThrow()
    expect(await attachmentExists(root, orphan)).toBe(true)
  })
})
