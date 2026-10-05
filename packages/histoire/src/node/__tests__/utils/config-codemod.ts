import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'

/** Scratch roots owned exclusively by codemod tests. */
const roots: string[] = []

/** Creates an isolated project containing exactly the requested config. */
export async function configTestProject(code?: string, name = 'histoire.config.ts') {
  const root = await mkdtemp(join(tmpdir(), 'histoire-codemod-'))
  roots.push(root)
  const file = join(root, name)
  if (code !== undefined) await writeFile(file, code)
  return { root, file }
}

/** Removes only scratch roots allocated by this test helper. */
export async function disposeConfigProjects() {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
}
