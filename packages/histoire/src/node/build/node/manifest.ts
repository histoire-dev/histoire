import type { ArtifactInventoryEntry, ArtifactManifest } from '../../deploy/artifact-schema.js'
import type { NodeBuildSnapshot } from './snapshot.js'
import { Buffer } from 'node:buffer'
import { artifactManifestSchema } from '../../deploy/artifact-schema.js'
import { ARTIFACT_SCHEMA_VERSION, MAX_ARTIFACT_MANIFEST_BYTES } from '../../deploy/artifact-version.js'
import { canonicalArtifactJson } from '../../deploy/identity.js'
import { hashContent } from '../../mcp/project/content-hash.js'

export { canonicalArtifactJson } from '../../deploy/identity.js'

/** Produces a stable, bounded manifest from completed metadata and public byte inventory. */
export function createArtifactManifest(snapshot: NodeBuildSnapshot, publicAssets: ArtifactInventoryEntry[], testRuntimeIncluded: boolean, histoireVersion: string): ArtifactManifest {
  const contents = [...snapshot.blobs].map(([path, text]) => ({ path, sha256: hashContent(text), bytes: Buffer.byteLength(text) })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  const payload = { schemaVersion: ARTIFACT_SCHEMA_VERSION, histoireVersion, ...snapshot.settings, testRuntimeIncluded, stories: snapshot.stories, contents, publicAssets: publicAssets.slice().sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) }
  const manifest = artifactManifestSchema.parse({ ...payload, buildId: hashContent(canonicalArtifactJson(payload)) })
  if (Buffer.byteLength(JSON.stringify(manifest)) > MAX_ARTIFACT_MANIFEST_BYTES) throw new Error('Node artifact manifest exceeds size limit')
  return manifest
}
