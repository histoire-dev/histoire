import { readFile, symlink, truncate, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readNodeArtifact } from '../../deploy/artifact-reader.js'
import { MAX_ARTIFACT_MANIFEST_BYTES } from '../../deploy/artifact-version.js'
import { createMcpArtifactFixture } from '../utils/mcp/artifact.js'

describe('bounded deployed artifact validation', () => {
  let fixture: Awaited<ReturnType<typeof createMcpArtifactFixture>>
  beforeEach(async () => {
    fixture = await createMcpArtifactFixture()
  })
  afterEach(async () => {
    await fixture.close()
  })

  it('validates private/public bytes and exposes source without source project', async () => {
    const artifact = await readNodeArtifact(fixture.root)
    expect(artifact.manifest.buildId).toBe(fixture.manifest.buildId)
    expect(await artifact.readContent(fixture.manifest.stories[0].docs!)).toBe('# Documentation\n😀\r\n')
  })

  it('rejects malformed manifest and public tampering before serving', async () => {
    await writeFile(join(fixture.publicDir, 'asset.js'), 'modified asset')
    await expect(readNodeArtifact(fixture.root)).rejects.toThrow('artifact')
    await writeFile(join(fixture.privateDir, 'manifest.json'), '{')
    await expect(readNodeArtifact(fixture.root)).rejects.toThrow('manifest')
  })

  it('rejects stale private content reads', async () => {
    const artifact = await readNodeArtifact(fixture.root)
    const ref = fixture.manifest.contents[0]
    await writeFile(join(fixture.privateDir, ref.path), 'changed')
    await expect(artifact.readContent(ref)).rejects.toThrow('artifact')
  })

  it('rejects digest-valid public symlink inventory', async () => {
    const bytes = await readFile(join(fixture.publicDir, 'index.html'))
    const outside = join(fixture.root, 'outside.html')
    await writeFile(outside, bytes)
    await unlink(join(fixture.publicDir, 'index.html'))
    await symlink(outside, join(fixture.publicDir, 'index.html'))
    await expect(readNodeArtifact(fixture.root)).rejects.toThrow('escapes inventory root')
  })

  it('rejects oversized sparse manifest before allocation', async () => {
    await truncate(join(fixture.privateDir, 'manifest.json'), MAX_ARTIFACT_MANIFEST_BYTES + 1)
    await expect(readNodeArtifact(fixture.root)).rejects.toThrow('manifest exceeds size limit')
  })
})
