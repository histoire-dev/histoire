import { lstat, mkdir, realpath } from 'node:fs/promises'
import { join } from 'pathe'

/**
 * Resolves a generated directory beneath the real project root, refusing symlinked or file segments.
 * @param root Project root.
 * @param segments Directory names below the root, e.g. `['.histoire', 'screenshots']`.
 * @param create Create missing segments instead of returning `undefined`.
 */
export async function projectDirectory(root: string, segments: readonly string[], create: boolean): Promise<string | undefined> {
  let directory = await realpath(root)
  for (const segment of segments) {
    directory = join(directory, segment)
    let entry = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (!entry && create) {
      await mkdir(directory).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error
      })
      entry = await lstat(directory)
    }
    if (!entry) return undefined
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error(`${segments.join('/')} directory cannot be a symlink or file`)
  }
  return directory
}
