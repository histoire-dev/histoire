import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { MCP_REPOSITORY_ROOT } from './cli-project.js'

/** Preserve examples' sibling stylesheet imports inside an owned fixture tree. */
export async function createExampleDirectory(prefix: string) {
  const directory = await mkdtemp(resolve(tmpdir(), prefix))
  const root = resolve(directory, 'project')
  try {
    await mkdir(root)
    await cp(resolve(MCP_REPOSITORY_ROOT, 'examples/shared'), resolve(directory, 'shared'), { recursive: true })
  }
  catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
  return {
    root,
    /** Release project, shared styles, and generated caches after runtime stops. */
    async close() { await rm(directory, { recursive: true, force: true }) },
  }
}
