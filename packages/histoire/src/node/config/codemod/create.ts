import type { ConfigPatch } from './types.js'
import { access, readFile } from 'node:fs/promises'
import path from 'pathe'
import { resolveConfigFile } from '../load.js'
import { editConfigCode } from './edit.js'
import { assertConfigPatches } from './paths.js'
import { guardConfigFile } from './security.js'

/** Creates source for a new project config, without writing it to disk. */
export async function createConfig(root: string, patches: ConfigPatch[]): Promise<{ file: string, code: string }> {
  assertConfigPatches(patches)
  const existing = resolveConfigFile(root)
  if (existing) {
    await guardConfigFile(existing, { root })
    throw new Error('Project already has a Histoire config file')
  }
  let typescript = false
  try {
    await access(path.join(root, 'tsconfig.json'))
    typescript = true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  let esm = typescript
  if (!typescript) {
    try {
      esm = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).type === 'module'
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  const file = path.join(root, `histoire.config.${typescript ? 'ts' : 'js'}`)
  await guardConfigFile(file, { root })
  let code = esm
    ? 'import { defineConfig } from \'histoire\'\n\nexport default defineConfig({\n})\n'
    : 'const { defineConfig } = require(\'histoire\')\n\nmodule.exports = defineConfig({\n})\n'
  for (const patch of patches) code = editConfigCode(code, patch)
  return { file, code }
}
