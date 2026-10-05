import type { ConfigAccessOptions } from './types.js'
import { lstat, realpath } from 'node:fs/promises'
import path from 'pathe'
import { configFileNames } from '../load.js'

/** Checks containment through path components, including symlinked ancestors. */
export async function guardProjectPath(file: string, root: string): Promise<string> {
  const project = await realpath(path.resolve(root))
  const target = path.resolve(file)
  const lexical = path.relative(path.resolve(root), target)
  if (lexical === '..' || lexical.startsWith('../') || path.isAbsolute(lexical)) throw new Error('Config path is outside project root')
  let ancestor = target
  let suffix = ''
  while (true) {
    try {
      const resolved = await realpath(ancestor)
      const relative = path.relative(project, resolved)
      if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('Config symlink escapes project root')
      return path.join(resolved, suffix)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const parent = path.dirname(ancestor)
      if (parent === ancestor) throw error
      suffix = path.join(path.basename(ancestor), suffix)
      ancestor = parent
    }
  }
}

/** Restricts file access to regular Histoire config files inside the project. */
export async function guardConfigFile(file: string, options: ConfigAccessOptions = {}): Promise<string> {
  if (!configFileNames.includes(path.basename(file))) throw new Error('Path is not a Histoire config file')
  const safe = await guardProjectPath(file, options.root ?? process.cwd())
  try {
    const stat = await lstat(safe)
    if (!stat.isFile()) throw new Error('Config path must be a regular file')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  return safe
}
