import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildPromptBlocks } from '../acp/prompt-blocks.js'
import { PNG_BYTES } from './utils/comments.js'

const PNG = Buffer.from(PNG_BYTES)

describe('aCP prompt content blocks', () => {
  let root: string
  let outside: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'histoire-blocks-'))
    outside = await mkdtemp(join(tmpdir(), 'histoire-outside-'))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  })

  it('inlines images only for image-capable agents and links other files', async () => {
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'shot.png'), PNG)
    await writeFile(join(root, 'src/a.ts'), 'x')
    const files = [{ path: 'shot.png', name: 'Shot', mimeType: 'image/png' }, { path: 'src/a.ts' }]
    const capable = await buildPromptBlocks({ root, text: 'Fix', context: 'Histoire context: {}', files, image: true })
    expect(capable).toEqual([
      { type: 'text', text: 'Histoire context: {}\n\nFix' },
      { type: 'image', data: PNG.toString('base64'), mimeType: 'image/png' },
      { type: 'resource_link', uri: pathToFileURL(join(root, 'src/a.ts')).href, name: 'a.ts', size: 1 },
    ])
    const plain = await buildPromptBlocks({ root, text: 'Fix', context: 'ctx', files, image: false })
    expect(plain[1]).toEqual({ type: 'resource_link', uri: pathToFileURL(join(root, 'shot.png')).href, name: 'Shot', mimeType: 'image/png', size: PNG.byteLength })
    expect(await buildPromptBlocks({ root, text: 'Fix', context: 'ctx', files: [{ path: '../outside.ts' }, { path: 'missing.ts' }], image: true })).toHaveLength(1)
  })

  it('sniffs image bytes instead of trusting the declared type', async () => {
    await writeFile(join(root, 'fake.png'), 'not an image')
    await writeFile(join(root, 'real.bin'), PNG)
    const blocks = await buildPromptBlocks({ root, text: 'Fix', context: 'ctx', files: [{ path: 'fake.png', mimeType: 'image/png' }, { path: 'real.bin', mimeType: 'application/octet-stream' }], image: true })
    expect(blocks[1]).toEqual({ type: 'resource_link', uri: pathToFileURL(join(root, 'fake.png')).href, name: 'fake.png', size: 12 })
    expect(blocks[2]).toEqual({ type: 'image', data: PNG.toString('base64'), mimeType: 'image/png' })
  })

  it('links images beyond the total inline budget and sends each file once', async () => {
    await writeFile(join(root, 'a.png'), PNG)
    await writeFile(join(root, 'b.png'), PNG)
    const files = [{ path: 'a.png' }, { path: './a.png' }, { path: 'b.png' }]
    const blocks = await buildPromptBlocks({ root, text: 'Fix', context: 'ctx', files, image: true, inlineBytes: PNG.byteLength })
    expect(blocks.map(block => block.type)).toEqual(['text', 'image', 'resource_link'])
    expect(blocks[2]).toMatchObject({ name: 'b.png', mimeType: 'image/png' })
  })

  it('refuses files reached through a symlinked folder outside the project', async () => {
    await writeFile(join(outside, 'secret.ts'), 'secret')
    await symlink(outside, join(root, 'linked'))
    expect(await buildPromptBlocks({ root, text: 'Fix', context: 'ctx', files: [{ path: 'linked/secret.ts' }], image: true })).toHaveLength(1)
  })

  it('accepts files when the project root itself is a symlink', async () => {
    await writeFile(join(root, 'a.ts'), 'x')
    const alias = join(outside, 'alias')
    await symlink(root, alias)
    expect(await buildPromptBlocks({ root: alias, text: 'Fix', context: 'ctx', files: [{ path: 'a.ts' }], image: true })).toHaveLength(2)
  })

  it('sends slash commands first so agents recognize them', async () => {
    expect(await buildPromptBlocks({ root: tmpdir(), text: '/review src', context: 'ctx', command: true, files: [], image: false })).toEqual([
      { type: 'text', text: '/review src' },
      { type: 'text', text: 'ctx' },
    ])
  })
})
