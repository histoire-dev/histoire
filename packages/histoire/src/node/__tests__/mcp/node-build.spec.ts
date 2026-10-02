import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inventoryPublicAssets, writeNodeContent } from '../../build/node/content.js'
import { assertNodeOutputSafe, createNodeBuildLayout } from '../../build/node/layout.js'
import { publishNodeArtifact } from '../../build/node/publish.js'
import { resolveBuildTarget } from '../../build/node/target.js'
import { hashContent } from '../../mcp/project/content-hash.js'
import { createMcpProjectFixture } from '../utils/mcp/project.js'

describe('node output layout and publication', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it('preserves default target and applies validated override', () => {
    expect(resolveBuildTarget({})).toBe('static')
    expect(resolveBuildTarget({ build: { target: 'node' } }, 'static')).toBe('static')
    expect(() => resolveBuildTarget({}, 'invalid')).toThrow('Unsupported Histoire build target: invalid')
  })

  it('rejects replacing project root or its parent, including symlink aliases', async () => {
    await expect(assertNodeOutputSafe(fixture.root, fixture.root)).rejects.toThrow('Node output cannot replace project root or an ancestor')
    await expect(assertNodeOutputSafe(fixture.root, join(fixture.root, '..'))).rejects.toThrow('Node output cannot replace project root or an ancestor')
    const { symlink } = await import('node:fs/promises')
    const alias = join(fixture.root, 'root-alias')
    await symlink(fixture.root, alias)
    await expect(assertNodeOutputSafe(fixture.root, alias)).rejects.toThrow('Node output cannot replace project root or an ancestor')
    await expect(assertNodeOutputSafe(fixture.root, join(fixture.root, 'dist'))).resolves.toBeUndefined()
  })

  it('publishes owned staging/public/private layout and replaces previous output', async () => {
    const outDir = join(fixture.root, 'dist')
    await mkdir(outDir)
    await writeFile(join(outDir, 'previous.txt'), 'valid previous')
    const layout = await createNodeBuildLayout(outDir)
    await writeFile(join(layout.publicDir, 'index.html'), 'browser')
    const text = 'shared docs/source'
    const hash = hashContent(text)
    await writeNodeContent(layout.privateDir, new Map([[`content/${hash}.txt`, text]]))
    await writeFile(join(layout.stagingDir, 'server.mjs'), 'export {}')
    await publishNodeArtifact(layout)
    expect(await readdir(outDir)).toEqual(['private', 'public', 'server.mjs'])
    expect(await readFile(join(outDir, 'public/index.html'), 'utf8')).toBe('browser')
    expect(await readFile(join(outDir, `private/content/${hash}.txt`), 'utf8')).toBe(text)
    expect(await readdir(fixture.root)).toEqual(['dist'])
  })

  it('abandoned staging cannot delete existing output or unrelated paths', async () => {
    const outDir = join(fixture.root, 'dist')
    await mkdir(outDir)
    await writeFile(join(outDir, 'index.html'), 'previous valid output')
    await writeFile(join(fixture.root, 'other'), 'keep')
    const layout = await createNodeBuildLayout(outDir)
    await layout.discard()
    expect(await readFile(join(outDir, 'index.html'), 'utf8')).toBe('previous valid output')
    expect(await readdir(fixture.root)).toEqual(['dist', 'other'])
  })

  it('failed publication restores previous valid output', async () => {
    const outDir = join(fixture.root, 'dist')
    await mkdir(outDir)
    await writeFile(join(outDir, 'index.html'), 'previous valid output')
    const layout = await createNodeBuildLayout(outDir)
    await layout.discard()
    await expect(publishNodeArtifact(layout)).rejects.toThrow()
    expect(await readFile(join(outDir, 'index.html'), 'utf8')).toBe('previous valid output')
    expect(await readdir(fixture.root)).toEqual(['dist'])
  })

  it('inventories public bytes deterministically and rejects symlink assets', async () => {
    const layout = await createNodeBuildLayout(join(fixture.root, 'dist'))
    await mkdir(join(layout.publicDir, 'assets'))
    await writeFile(join(layout.publicDir, 'index.html'), 'HTML')
    await writeFile(join(layout.publicDir, 'assets/a.js'), 'JS')
    const inventory = await inventoryPublicAssets(layout.publicDir)
    expect(inventory.map(file => [file.path, file.bytes])).toEqual([['assets/a.js', 2], ['index.html', 4]])
    const { symlink } = await import('node:fs/promises')
    await symlink(join(fixture.root, 'missing'), join(layout.publicDir, 'escape'))
    await expect(inventoryPublicAssets(layout.publicDir)).rejects.toThrow('Node public output contains a nonregular asset')
    await layout.discard()
  })
})
