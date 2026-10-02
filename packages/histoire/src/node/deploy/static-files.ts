import type { ServerResponse } from 'node:http'
import type { NodeArtifact } from './artifact-reader.js'
import { extname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { openArtifactFile, verifyOpenedArtifactFile } from './artifact-files.js'

/** Browser asset MIME types; unknown files stay opaque. */
const contentTypes: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json' }

/** Serve exact verified inventory bytes; no arbitrary path opens or directory reads. */
export async function serveArtifactAsset(artifact: NodeArtifact, path: string, response: ServerResponse, head: boolean): Promise<boolean> {
  const entry = artifact.publicAssets.get(path)
  if (!entry) return false
  // Hash and stream one descriptor: an atomic path replacement cannot substitute
  // unverified bytes between digest validation and public transmission.
  const owned = await openArtifactFile(artifact.publicDir, entry.path, entry)
  const { file } = owned
  try {
    await verifyOpenedArtifactFile(artifact.publicDir, entry, owned)
    response.writeHead(200, { 'Content-Type': contentTypes[extname(path).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': entry.bytes, 'Cache-Control': path.endsWith('.html') || path === 'histoire.json' ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' })
    if (head || !entry.bytes) response.end()
    else await pipeline(file.createReadStream({ autoClose: false, start: 0, end: entry.bytes - 1 }), response)
  }
  finally { await file.close() }
  return true
}
