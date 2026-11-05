import { Buffer } from 'node:buffer'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { guardProjectPath } from '../../config/codemod/security.js'
import { findWorkspaceRoot, lockfiles } from '../changes/package-manager.js'

/** Exact original file bytes retained privately for rollback. */
interface SnapshotFile {
  /** Absolute destination captured from the trusted project. */ file: string
  /** Base64 bytes; null means the file did not exist. */ bytes: string | null
  /** Original filesystem permission bits. */ mode?: number
}
/** Original package manifests and locks across the project workspace boundary. */
export interface ProjectSnapshot {
  /** Guard boundary, including workspace-root lockfiles. */ root: string
  /** Files present or absent before invoking the package manager. */ files: SnapshotFile[]
}

/** Captures every supported lock name, including absent locks created on failure. */
export async function snapshotProject(root: string): Promise<ProjectSnapshot> {
  const boundary = await findWorkspaceRoot(root)
  const files: SnapshotFile[] = []
  let bytes = 0
  for (let directory = path.resolve(root); ; directory = path.dirname(directory)) {
    for (const name of ['package.json', ...lockfiles]) {
      const file = await guardProjectPath(path.join(directory, name), boundary)
      try {
        const info = await stat(file)
        if (!info.isFile()) throw new Error('Package manifest or lockfile is not a regular file')
        bytes += info.size
        if (bytes > 10 * 1024 * 1024) throw new Error('Package snapshots exceed safe receipt capacity. Run the change manually.')
        files.push({ file, bytes: (await readFile(file)).toString('base64'), mode: info.mode })
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        files.push({ file, bytes: null })
      }
    }
    if (directory === boundary) break
  }
  return { root: boundary, files }
}

/** Restores exact bytes; returns destinations that could not safely be restored. */
export async function restoreProject(snapshot: ProjectSnapshot): Promise<string[]> {
  const leftovers: string[] = []
  for (const entry of snapshot.files) {
    try {
      const file = await guardProjectPath(entry.file, snapshot.root)
      if (file !== entry.file) throw new Error('Package path changed')
      if (entry.bytes === null) await rm(file, { force: true })
      else await writeFile(file, Buffer.from(entry.bytes, 'base64'), { mode: entry.mode })
    }
    catch { leftovers.push(path.relative(snapshot.root, entry.file)) }
  }
  return leftovers
}
