import { Buffer } from 'node:buffer'
import * as filesystem from 'node:fs/promises'
import { mkdir, rename, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProjectCatalog } from '../../mcp/project/catalog.js'
import { isPathWithinRoot, readRegisteredText } from '../../mcp/project/containment.js'
import { createProjectContent } from '../../mcp/project/content.js'
import { getResolvedStorySourceId, storySource } from '../../virtual/story-source.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory, MCP_PROJECT_OPTIONS } from '../utils/mcp/project.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof filesystem>()
  return { ...original, open: vi.fn(original.open) }
})

const actualFilesystem = await vi.importActual<typeof filesystem>('node:fs/promises')

describe('registered content containment', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  let outside: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    vi.mocked(filesystem.open).mockImplementation(actualFilesystem.open)
    fixture = await createMcpProjectFixture()
    outside = await createMcpProjectFixture()
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.mocked(filesystem.open).mockReset()
    await Promise.all([fixture.close(), outside.close()])
  })

  it('rejects root siblings, NUL and Windows absolute paths without exposing target bytes', async () => {
    await writeFile(join(outside.root, 'secret'), 'outside secret')
    expect(isPathWithinRoot('/project', '/project-other/secret')).toBe(false)
    expect(isPathWithinRoot('/project', '/project/../secret')).toBe(false)
    expect(isPathWithinRoot('/project', '/project/content')).toBe(true)
    await expect(readRegisteredText(fixture.root, join(outside.root, 'secret'))).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' })
    await expect(readRegisteredText(fixture.root, 'C:\\outside\\secret')).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' })
    await expect(readRegisteredText(fixture.root, `${fixture.root}\0`)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
  })

  it('marks outside symlinks unavailable while existing Source panel remains unrestricted', async () => {
    await writeFile(join(outside.root, 'secret'), 'outside secret')
    const file = createMcpStory(fixture.root)
    file.virtual = false
    await symlink(join(outside.root, 'secret'), file.path)
    const catalog = createProjectCatalog({ root: fixture.root, ...MCP_PROJECT_OPTIONS })
    const context = createMcpContext(fixture.root, [file])
    await catalog.publish(context)
    expect(catalog.current.stories[0].sourceAvailable).toBe(false)
    await expect(createProjectContent({ root: fixture.root, catalog }).getSource({ storyId: file.story.id })).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' })
    expect(await storySource(context, getResolvedStorySourceId(file.story.id))).toBe('export default "outside secret"')
  })

  it('rejects a physical file swapped for an outside symlink between stat and open', async () => {
    const file = await fixture.physical('safe')
    const outsidePath = join(outside.root, 'secret')
    await writeFile(outsidePath, 'outside secret')
    vi.mocked(filesystem.open).mockImplementationOnce(async (path, flags, mode) => {
      await unlink(file.path)
      await symlink(outsidePath, file.path)
      return actualFilesystem.open(path, flags, mode)
    })
    await expect(readRegisteredText(fixture.root, file.path)).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' })
  })

  it('rejects content changed during a read rather than publishing a mixed page', async () => {
    const file = await fixture.physical('safe')
    const catalog = createProjectCatalog({ root: fixture.root, ...MCP_PROJECT_OPTIONS })
    await catalog.publish(createMcpContext(fixture.root, [file]))
    vi.mocked(filesystem.open).mockImplementationOnce(async (path, flags, mode) => {
      const handle = await actualFilesystem.open(path, flags, mode)
      const originalRead = handle.read.bind(handle)
      vi.spyOn(handle, 'read').mockImplementationOnce(async (...args: any[]) => {
        const result = await originalRead(...args)
        await writeFile(file.path, 'changed')
        return result
      })
      return handle
    })
    await expect(createProjectContent({ root: fixture.root, catalog }).getSource({ storyId: file.story.id })).rejects.toMatchObject({ code: 'STALE_REVISION' })
  })

  it('consumes short file reads within one byte bound and preserves exact UTF-8 bytes', async () => {
    const file = await fixture.physical('\uFEFF🐈\r\n')
    vi.mocked(filesystem.open).mockImplementationOnce(async (path, flags, mode) => {
      const handle = await actualFilesystem.open(path, flags, mode)
      const originalRead = handle.read.bind(handle)
      vi.spyOn(handle, 'read').mockImplementation(async (buffer, offset, length, position) => originalRead(buffer, offset, Math.min(length, 1), position))
      return handle
    })
    expect((await readRegisteredText(fixture.root, file.path)).text).toBe('\uFEFF🐈\r\n')
  })

  it('rejects originally safe symlink replaced with outside target after publication', async () => {
    const safePath = join(fixture.root, 'safe')
    const secretPath = join(outside.root, 'secret')
    await writeFile(safePath, 'safe')
    await writeFile(secretPath, 'outside secret')
    const file = createMcpStory(fixture.root)
    file.virtual = false
    await symlink(safePath, file.path)
    const catalog = createProjectCatalog({ root: fixture.root, ...MCP_PROJECT_OPTIONS })
    await catalog.publish(createMcpContext(fixture.root, [file]))
    const content = createProjectContent({ root: fixture.root, catalog })
    expect((await content.getSource({ storyId: file.story.id })).text).toBe('safe')
    await unlink(file.path)
    await symlink(secretPath, file.path)
    await expect(content.getSource({ storyId: file.story.id })).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' })
  })

  it('rejects replaced physical files, nonregular files, invalid UTF-8, NUL and oversized bytes', async () => {
    const file = await fixture.physical('old')
    const catalog = createProjectCatalog({ root: fixture.root, ...MCP_PROJECT_OPTIONS })
    await catalog.publish(createMcpContext(fixture.root, [file]))
    const content = createProjectContent({ root: fixture.root, catalog })
    const replacement = join(fixture.root, 'new')
    await writeFile(replacement, 'new')
    await rename(replacement, file.path)
    await expect(content.getSource({ storyId: file.story.id })).rejects.toMatchObject({ code: 'STALE_REVISION' })
    await writeFile(file.path, Buffer.from([0xC3, 0x28]))
    await expect(readRegisteredText(fixture.root, file.path)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
    await writeFile(file.path, 'a\0b')
    await expect(readRegisteredText(fixture.root, file.path)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
    await writeFile(file.path, Buffer.alloc(2 * 1024 * 1024 + 1))
    await expect(readRegisteredText(fixture.root, file.path)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
    const directory = join(fixture.root, 'directory')
    await mkdir(directory)
    await expect(readRegisteredText(fixture.root, directory)).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
  })
})
