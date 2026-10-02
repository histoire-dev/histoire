import type { ArtifactInventoryEntry } from './artifact-schema.js'
import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { hashContent } from '../mcp/project/content-hash.js'
import { MAX_ARTIFACT_INVENTORY_BYTES, readArtifactFile, readArtifactManifest } from './artifact-files.js'
import { artifactManifestSchema } from './artifact-schema.js'
import { MAX_ARTIFACT_MANIFEST_BYTES } from './artifact-version.js'
import { canonicalArtifactJson } from './identity.js'

/** Reject duplicate inventory paths and excessive aggregate startup validation. */
function inventory(entries: ArtifactInventoryEntry[]) {
  const map = new Map(entries.map(entry => [entry.path, entry]))
  if (map.size !== entries.length || entries.reduce((total, entry) => total + entry.bytes, 0) > MAX_ARTIFACT_INVENTORY_BYTES) throw new Error('Node artifact inventory exceeds limits or contains duplicate paths')
  return map
}

/** Validate complete immutable artifact before listener or optional browser import. */
export async function readNodeArtifact(directory: string) {
  const root = await realpath(directory)
  const publicDir = await realpath(join(root, 'public'))
  const privateDir = await realpath(join(root, 'private'))
  if (publicDir !== join(root, 'public') || privateDir !== join(root, 'private')) throw new Error('Node artifact roots cannot be symlinks')
  const raw = await readArtifactManifest(privateDir, MAX_ARTIFACT_MANIFEST_BYTES)
  let manifest
  try {
    manifest = artifactManifestSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw)))
  }
  catch { throw new Error('Node artifact manifest is malformed or unsupported') }
  const { buildId, ...payload } = manifest
  if (hashContent(canonicalArtifactJson(payload)) !== buildId) throw new Error('Node artifact manifest build identity differs')
  const contents = inventory(manifest.contents)
  const publicAssets = inventory(manifest.publicAssets)
  for (const required of ['index.html', '__sandbox.html', 'histoire.json']) {
    if (!publicAssets.has(required)) throw new Error(`Node artifact missing required public asset: ${required}`)
  }
  for (const story of manifest.stories) {
    for (const reference of [story.source.kind === 'unavailable' ? undefined : story.source, story.docs]) {
      const entry = reference && contents.get(reference.path)
      if (reference && (!entry || entry.sha256 !== reference.sha256 || entry.bytes !== reference.bytes)) throw new Error('Node artifact story content is absent from inventory')
    }
  }
  for (const entry of contents.values()) await readArtifactFile(privateDir, entry)
  for (const entry of publicAssets.values()) await readArtifactFile(publicDir, entry)
  return {
    root,
    publicDir,
    privateDir,
    manifest,
    publicAssets,
    /** Reads registered private text only, preserving original UTF-8 BOM and bytes. */
    async readContent(reference: ArtifactInventoryEntry) {
      const entry = contents.get(reference.path)
      if (!entry || entry.sha256 !== reference.sha256 || entry.bytes !== reference.bytes) throw new Error('Node artifact content is not in inventory')
      const bytes = await readArtifactFile(privateDir, entry, true)
      try {
        return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
      }
      catch { throw new Error('Node artifact content is not valid UTF-8') }
    },
  }
}

/** Validated immutable artifact accepted by catalog/listener adapters. */
export type NodeArtifact = Awaited<ReturnType<typeof readNodeArtifact>>
