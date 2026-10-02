import type { NodeBuildLayout } from './layout.js'
import { lstat, rename, rm } from 'node:fs/promises'

/** Replaces a directory transactionally; a failed rename restores the previous artifact. */
export async function publishNodeArtifact(layout: NodeBuildLayout): Promise<void> {
  const backup = `${layout.stagingDir}-previous`
  let backedUp = false
  try {
    const previous = await lstat(layout.outDir).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
      return undefined
    })
    if (previous) {
      if (!previous.isDirectory() || previous.isSymbolicLink()) throw new Error('Node output must replace a regular directory')
      await rename(layout.outDir, backup)
      backedUp = true
    }
    try {
      await rename(layout.stagingDir, layout.outDir)
    }
    catch (error) {
      if (backedUp) {
        await rename(backup, layout.outDir)
        backedUp = false
      }
      throw error
    }
    if (backedUp) {
      try {
        await rm(backup, { recursive: true })
      }
      catch { throw new Error('Node artifact published; previous output backup cleanup failed') }
    }
  }
  finally { await layout.discard() }
}
