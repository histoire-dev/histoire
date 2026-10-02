import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { isPathWithinRoot } from '../../mcp/project/containment.js'

/** Resolves existing parent aliases before checking an output path that may not exist yet. */
async function canonicalOutput(path: string): Promise<string> {
  try {
    return await realpath(path)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const parent = dirname(path)
    if (parent === path) throw error
    return join(await canonicalOutput(parent), basename(path))
  }
}

/** Prevents a misconfigured replacement from renaming or deleting the project itself. */
export async function assertNodeOutputSafe(projectRoot: string, output: string): Promise<void> {
  const root = await realpath(projectRoot)
  const outDir = await canonicalOutput(resolve(output))
  if (isPathWithinRoot(outDir, root)) throw new Error('Node output cannot replace project root or an ancestor')
}

/** Owned sibling staging keeps failed Node packaging away from previous valid output. */
export interface NodeBuildLayout {
  /** Configured final deployment directory. */
  outDir: string
  /** Unique owned staging directory, containing the full artifact. */
  stagingDir: string
  /** Browser-only assets, separate from private snapshot. */
  publicDir: string
  /** Private metadata and registered content. */
  privateDir: string
  /** Deletes only this build's staging path when it still exists. */
  discard: () => Promise<void>
}

/** Allocates a fresh staging root beside the final output for same-filesystem renames. */
export async function createNodeBuildLayout(output: string): Promise<NodeBuildLayout> {
  const outDir = resolve(output)
  const parent = dirname(outDir)
  await mkdir(parent, { recursive: true })
  const stagingDir = await mkdtemp(join(parent, `.${basename(outDir)}-histoire-node-`))
  const publicDir = join(stagingDir, 'public')
  const privateDir = join(stagingDir, 'private')
  await mkdir(publicDir)
  await mkdir(privateDir)
  return { outDir, stagingDir, publicDir, privateDir, discard: () => rm(stagingDir, { recursive: true, force: true }) }
}
