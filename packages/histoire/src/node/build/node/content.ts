import type { ArtifactInventoryEntry } from '../../deploy/artifact-schema.js'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { artifactContentRefSchema, artifactInventoryEntrySchema } from '../../deploy/artifact-schema.js'
import { hashContent } from '../../mcp/project/content-hash.js'

/** Writes only deduplicated digest-addressed content owned by this build. */
export async function writeNodeContent(privateDir: string, blobs: ReadonlyMap<string, string>): Promise<void> {
  for (const [path, text] of blobs) {
    artifactContentRefSchema.parse({ path, sha256: hashContent(text), bytes: Buffer.byteLength(text) })
    const output = join(privateDir, path)
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, text, 'utf8')
  }
}

/** Hashes a file incrementally so public bundles never need full-file allocations. */
async function hashAsset(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

/** Inventories only regular generated public files, rejecting symlink escape paths. */
export async function inventoryPublicAssets(publicDir: string): Promise<ArtifactInventoryEntry[]> {
  const result: ArtifactInventoryEntry[] = []
  /** Walks owned browser output in stable portable path order. */
  async function visit(relative = ''): Promise<void> {
    const entries = await readdir(join(publicDir, relative))
    entries.sort()
    for (const name of entries) {
      const path = relative ? `${relative}/${name}` : name
      const absolute = join(publicDir, path)
      const identity = await lstat(absolute)
      if (identity.isDirectory()) await visit(path)
      else if (identity.isFile()) result.push(artifactInventoryEntrySchema.parse({ path, bytes: identity.size, sha256: await hashAsset(absolute) }))
      else throw new Error('Node public output contains a nonregular asset')
    }
  }
  await visit()
  return result
}
