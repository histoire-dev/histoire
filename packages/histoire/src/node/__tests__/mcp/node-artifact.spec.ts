import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeNodeArtifact } from '../../build/node/artifact.js'
import { createNodeBuildLayout } from '../../build/node/layout.js'
import { captureNodeBuildInputs, createNodeBuildSnapshot } from '../../build/node/snapshot.js'
import { createMcpContext, createMcpProjectFixture, createMcpStory } from '../utils/mcp/project.js'

describe('complete private artifact writer', () => {
  let fixture: Awaited<ReturnType<typeof createMcpProjectFixture>>
  beforeEach(async () => {
    fixture = await createMcpProjectFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it('emits full layout and deduplicates identical source/docs bytes', async () => {
    const file = createMcpStory(fixture.root)
    file.story.docsText = file.moduleCode
    const ctx = createMcpContext(fixture.root, [file])
    const snapshot = await createNodeBuildSnapshot(ctx, await captureNodeBuildInputs(ctx))
    const layout = await createNodeBuildLayout(join(fixture.root, 'dist'))
    await writeFile(join(layout.publicDir, 'index.html'), 'public browser entry')
    const entryFile = join(fixture.root, 'fixture-runtime.mjs')
    await writeFile(entryFile, 'export const fixture = true')
    const manifest = await writeNodeArtifact({ layout, snapshot, entryFile, testRuntimeIncluded: false, histoireVersion: '1.2.3' })
    expect(manifest.contents).toHaveLength(1)
    expect(await readdir(layout.stagingDir)).toEqual(['package.json', 'private', 'public', 'server.mjs'])
    expect(JSON.parse(await readFile(join(layout.privateDir, 'manifest.json'), 'utf8'))).toEqual(manifest)
    expect(await readFile(join(layout.privateDir, manifest.contents[0].path), 'utf8')).toBe(file.moduleCode)
    await layout.discard()
  })

  it('keeps build-machine executable paths out of copied artifacts and pins core only', async () => {
    const buildPath = '/home/build-agent/private/chrome with spaces'
    const ctx = createMcpContext(fixture.root, [createMcpStory(fixture.root)])
    ctx.config.browser = { source: 'executable', executablePath: buildPath }
    const snapshot = await createNodeBuildSnapshot(ctx, await captureNodeBuildInputs(ctx))
    const layout = await createNodeBuildLayout(join(fixture.root, 'dist'))
    await writeFile(join(layout.publicDir, 'index.html'), 'public browser entry')
    const entryFile = join(fixture.root, 'fixture-runtime.mjs')
    await writeFile(entryFile, 'export const fixture = true')

    const manifest = await writeNodeArtifact({ layout, snapshot, entryFile, testRuntimeIncluded: false, histoireVersion: '1.2.3', browserDriver: { packageName: 'playwright-core', version: '1.60.2' } })
    const packageManifest = await readFile(join(layout.stagingDir, 'package.json'), 'utf8')
    const server = await readFile(join(layout.stagingDir, 'server.mjs'), 'utf8')
    expect(packageManifest).toContain('"playwright-core": "1.60.2"')
    expect(packageManifest).not.toContain('"playwright"')
    expect(`${JSON.stringify(manifest)}${packageManifest}${server}`).not.toContain(buildPath)
    await layout.discard()
  })

  it('native import validation rejects startup side effects before publication', async () => {
    const ctx = createMcpContext(fixture.root, [createMcpStory(fixture.root)])
    const snapshot = await createNodeBuildSnapshot(ctx, await captureNodeBuildInputs(ctx))
    const layout = await createNodeBuildLayout(join(fixture.root, 'dist'))
    const entryFile = join(fixture.root, 'broken-runtime.mjs')
    await writeFile(entryFile, 'throw new Error("fixture import failure")')
    await expect(writeNodeArtifact({ layout, snapshot, entryFile, testRuntimeIncluded: false, histoireVersion: '1.2.3' })).rejects.toThrow('fixture import failure')
    await layout.discard()
    expect(await readdir(fixture.root)).toEqual(['broken-runtime.mjs'])
  })
})
