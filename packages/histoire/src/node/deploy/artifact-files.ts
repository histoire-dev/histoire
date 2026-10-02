import type { ArtifactInventoryEntry } from './artifact-schema.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

/** Bound aggregate validation work before opening inventory files. */
export const MAX_ARTIFACT_INVENTORY_BYTES = 1024 * 1024 * 1024

/** Opens only regular inventory files below canonical root, rejecting symlinks. */
export async function openArtifactFile(root: string, path: string, expected?: ArtifactInventoryEntry) {
  const candidate = join(root, path)
  const canonical = await realpath(candidate)
  const relation = relative(root, canonical)
  const before = await lstat(candidate)
  if (isAbsolute(relation) || relation === '..' || relation.startsWith(`..${sep}`) || canonical !== candidate || !before.isFile()) throw new Error('Node artifact file escapes inventory root')
  const file = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await file.stat()
    const current = await lstat(candidate)
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.dev !== current.dev || stat.ino !== current.ino || !current.isFile() || await realpath(candidate) !== candidate || (expected && stat.size !== expected.bytes)) throw new Error('Node artifact file identity or byte length differs from inventory')
    return { file, stat }
  }
  catch (error) {
    await file.close()
    throw error
  }
}

/** Verify one already-owned descriptor without closing or replacing its byte authority. */
export async function verifyOpenedArtifactFile(root: string, entry: ArtifactInventoryEntry, owned: Awaited<ReturnType<typeof openArtifactFile>>, retain = false) {
  const { file, stat } = owned
  const chunks: Buffer[] = []
  const hash = createHash('sha256')
  const buffer = Buffer.alloc(Math.min(64 * 1024, entry.bytes + 1))
  let total = 0
  while (true) {
    const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, entry.bytes - total + 1), total)
    if (!bytesRead) break
    total += bytesRead
    if (total > entry.bytes) throw new Error('Node artifact file grew during read')
    hash.update(buffer.subarray(0, bytesRead))
    if (retain) chunks.push(Buffer.from(buffer.subarray(0, bytesRead)))
  }
  const after = await file.stat()
  const candidate = join(root, entry.path)
  const current = await lstat(candidate)
  if (total !== entry.bytes || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || !current.isFile() || current.dev !== after.dev || current.ino !== after.ino || current.size !== after.size || current.mtimeMs !== after.mtimeMs || current.ctimeMs !== after.ctimeMs || hash.digest('hex') !== entry.sha256 || await realpath(candidate) !== candidate) throw new Error('Node artifact bytes differ from inventory')
  return retain ? Buffer.concat(chunks, total) : undefined
}

/** Stream bounded bytes into digest; optionally retain only small private text. */
export async function readArtifactFile(root: string, entry: ArtifactInventoryEntry, retain = false) {
  const owned = await openArtifactFile(root, entry.path, entry)
  try {
    return await verifyOpenedArtifactFile(root, entry, owned, retain)
  }
  finally { await owned.file.close() }
}

/** Reads manifest with fixed allocation and one extra byte to detect growth. */
export async function readArtifactManifest(root: string, maximum: number) {
  const { file, stat } = await openArtifactFile(root, 'manifest.json')
  try {
    if (stat.size > maximum) throw new Error('Node artifact manifest exceeds size limit')
    const bytes = Buffer.alloc(stat.size + 1)
    let total = 0
    while (total < bytes.length) {
      const result = await file.read(bytes, total, bytes.length - total, null)
      if (!result.bytesRead) break
      total += result.bytesRead
    }
    const after = await file.stat()
    if (total !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs || await realpath(join(root, 'manifest.json')) !== join(root, 'manifest.json')) throw new Error('Node artifact manifest changed during read')
    return bytes.subarray(0, total)
  }
  finally { await file.close() }
}
