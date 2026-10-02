import type { ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { renameSync, writeFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as artifactFiles from '../../deploy/artifact-files.js'
import { readNodeArtifact } from '../../deploy/artifact-reader.js'
import { serveArtifactAsset } from '../../deploy/static-files.js'
import { createMcpArtifactFixture } from '../utils/mcp/artifact.js'

/** Real Writable response observes headers and streamed bytes without sockets. */
function response() {
  const chunks: Buffer[] = []
  const stream = new Writable({ write(chunk, _encoding, done) {
    chunks.push(Buffer.from(chunk))
    done()
  } })
  const writeHead = vi.fn()
  Object.assign(stream, { writeHead })
  return { response: stream as unknown as ServerResponse, writeHead, text: () => Buffer.concat(chunks).toString('utf8') }
}

describe('verified Node static descriptor ownership', () => {
  let fixture: Awaited<ReturnType<typeof createMcpArtifactFixture>>
  let artifact: Awaited<ReturnType<typeof readNodeArtifact>>
  beforeEach(async () => {
    fixture = await createMcpArtifactFixture()
    artifact = await readNodeArtifact(fixture.root)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await fixture.close()
  })

  it('rejects same-size replacement before opening bytes for transmission', async () => {
    const original = artifactFiles.openArtifactFile
    vi.spyOn(artifactFiles, 'openArtifactFile').mockImplementationOnce(async (...argumentsList) => {
      const replaced = join(fixture.publicDir, 'replacement.html')
      await writeFile(replaced, '<html>Leak</html>')
      await rename(replaced, join(fixture.publicDir, 'index.html'))
      return original(...argumentsList)
    })
    const output = response()
    await expect(serveArtifactAsset(artifact, 'index.html', output.response, false)).rejects.toThrow('bytes differ from inventory')
    expect(output.writeHead).not.toHaveBeenCalled()
    expect(output.text()).toBe('')
  })

  it('streams original verified descriptor when path is replaced after hashing', async () => {
    const original = artifactFiles.openArtifactFile
    vi.spyOn(artifactFiles, 'openArtifactFile').mockImplementationOnce(async (...argumentsList) => {
      const owned = await original(...argumentsList)
      const stream = owned.file.createReadStream.bind(owned.file)
      vi.spyOn(owned.file, 'createReadStream').mockImplementation((options) => {
        const replacement = join(fixture.publicDir, 'replacement.html')
        writeFileSync(replacement, '<html>Leak</html>')
        renameSync(replacement, join(fixture.publicDir, 'index.html'))
        return stream(options)
      })
      return owned
    })
    const output = response()
    expect(await serveArtifactAsset(artifact, 'index.html', output.response, false)).toBe(true)
    expect(output.text()).toBe('<html>Book</html>')
    expect(output.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Content-Length': 17 }))
  })
})
