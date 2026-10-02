import { createRequire } from 'node:module'
import { resolve } from 'pathe'
import { importResolvedModule } from './import-resolved.js'

/** Load exactly the project's Vitest Node API, matching its browser runtime install. */
export async function loadProjectVitest(root: string): Promise<typeof import('vitest/node')> {
  const projectRequire = createRequire(resolve(root, 'package.json'))
  return importResolvedModule<typeof import('vitest/node')>(projectRequire.resolve('vitest/node'))
}
