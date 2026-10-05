import { cp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createStaticCaptureMetadata } from '../../runtime/catalog/build-metadata.js'
import { readBuiltPreviewSnapshot } from '../../runtime/catalog/built.js'
import { createEmbedBuiltOutput } from '../utils/embed/built-output.js'
import { createMcpArtifactFixture } from '../utils/mcp/artifact.js'
import { createMcpProjectFixture } from '../utils/mcp/project.js'

describe('immutable built preview targets', () => {
  const fixtures: Awaited<ReturnType<typeof createMcpProjectFixture>>[] = []
  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map(fixture => fixture.close()))
  })

  /** Writes completed static output without any live runtime or embed descriptor. */
  async function staticOutput() {
    const output = await createEmbedBuiltOutput()
    fixtures.push(output.fixture)
    return output
  }

  it('reads copied static output with exact IDs/base/defaults independently of original root', async () => {
    const original = await staticOutput()
    const copied = await createMcpProjectFixture()
    fixtures.push(copied)
    await cp(original.outputRoot, join(copied.root, 'copy'), { recursive: true })
    await original.fixture.close()
    const snapshot = await readBuiltPreviewSnapshot(join(copied.root, 'copy'))
    expect(snapshot).toMatchObject({ mode: 'static', base: '/book/', buildId: original.capture.buildId, capture: { available: true }, defaults: { colorScheme: 'dark', backgroundColor: '#fff', textDirection: 'ltr', globals: {} } })
    expect(snapshot.getTarget('a:b', 'c:d').variant.id).toBe('c:d')
    expect(Object.isFrozen(snapshot.catalog.stories)).toBe(true)
    expect(JSON.stringify(snapshot.catalog)).not.toContain(original.fixture.root)
  })

  it('keeps legacy outputs browsable but rejects capture and malformed/tampered metadata', async () => {
    const output = await staticOutput()
    await writeFile(join(output.outputRoot, 'histoire.json'), JSON.stringify(output.data))
    expect((await readBuiltPreviewSnapshot(output.outputRoot)).capture).toMatchObject({ available: false, reason: 'CAPABILITY_UNAVAILABLE' })
    await writeFile(join(output.outputRoot, 'histoire.json'), JSON.stringify({ ...output.data, capture: { ...output.capture, buildId: 'bad' } }))
    await expect(readBuiltPreviewSnapshot(output.outputRoot)).rejects.toThrow('malformed')
    await writeFile(join(output.outputRoot, 'histoire.json'), JSON.stringify({ ...output.data, capture: output.capture }))
    await writeFile(join(output.outputRoot, 'asset.js'), 'changed')
    await expect(readBuiltPreviewSnapshot(output.outputRoot)).rejects.toThrow('identity')
  })

  it('excludes identity-bearing metadata from asset hash without hiding runtime changes', async () => {
    const output = await staticOutput()
    await writeFile(join(output.outputRoot, 'histoire-embed.json'), '{"epoch":"self"}')
    await writeFile(join(output.outputRoot, 'histoire-embed-origins.json'), '["https://host.example"]')
    await mkdir(join(output.outputRoot, 'assets'))
    await writeFile(join(output.outputRoot, 'assets/histoire-local.json'), '{"epoch":"self"}')
    expect((await createStaticCaptureMetadata(output.ctx, output.data, output.outputRoot)).buildId).toBe(output.capture.buildId)
    await writeFile(join(output.outputRoot, 'asset.js'), 'changed')
    expect((await createStaticCaptureMetadata(output.ctx, output.data, output.outputRoot)).buildId).not.toBe(output.capture.buildId)
  })

  it('uses validated Node private manifest only internally', async () => {
    const artifact = await createMcpArtifactFixture('/node/')
    fixtures.push(artifact)
    const snapshot = await readBuiltPreviewSnapshot(artifact.root)
    expect(snapshot).toMatchObject({ mode: 'node', publicRoot: artifact.publicDir, buildId: artifact.manifest.buildId, base: '/node/', capture: { available: true } })
    expect(snapshot.getTarget('story-a', 'default').variant.id).toBe('default')
    expect(JSON.stringify(snapshot.catalog)).not.toContain('private/')
    expect(JSON.stringify(snapshot.catalog)).not.toContain(artifact.root)
  })
})
