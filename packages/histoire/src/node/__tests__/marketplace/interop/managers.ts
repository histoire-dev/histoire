import type { MarketplacePrefs } from '@histoire/shared'
import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { resolveBinary } from '../../../marketplace/jobs/spawn.js'

/** Supported real manager identities. */
export type ManagerName = Exclude<MarketplacePrefs['packageManager'], 'auto'>
/** Version-probed binary; failed probes remain visible skipped test groups. */
export interface Manager {
  /** Command used by production planner. */ name: ManagerName
  /** Real executable, possibly Corepack's existing local shim. */ binary?: string
  /** Successful offline version probe. */ available: boolean
  /** Version or short skip reason. */ reason: string
}
/** Disable manager bootstrapping/network downloads during binary discovery. */
export const corepackEnvironment = {
  /** Never fetch a missing manager distribution. */ COREPACK_ENABLE_NETWORK: '0',
  /** Discovery ignores any parent project pin. */ COREPACK_ENABLE_PROJECT_SPEC: '0',
  /** Reuse installed distribution without registry version lookup. */ COREPACK_DEFAULT_TO_LATEST: '0',
  /** Never wait for an interactive bootstrap prompt. */ COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
}
/** Probe supported managers without installing anything or contacting registries. */
export async function availableManagers(): Promise<Manager[]> {
  const nodeDirectory = dirname(process.execPath)
  const environment = { ...process.env, ...corepackEnvironment, PATH: `${nodeDirectory}:${process.env.PATH}` }
  return Promise.all((['npm', 'pnpm', 'yarn', 'bun'] as const).map(async (name) => {
    try {
      // Prefer Node's actual npm entry and locally installed Corepack shim over
      // mise wrappers, which can attempt to mutate the tool installation.
      const candidate = name === 'npm'
        ? join(nodeDirectory, '../lib/node_modules/npm/bin/npm-cli.js')
        : name === 'pnpm' ? join(nodeDirectory, '../lib/node_modules/corepack/dist/pnpm.js') : undefined
      const binary = candidate && await access(candidate).then(() => true, () => false) ? candidate : await resolveBinary(name, environment)
      const { stdout } = await promisify(execFile)(binary, ['--version'], { env: environment, cwd: '/tmp', timeout: 10_000 })
      const version = stdout.trim()
      if (!/^\d+\.\d+\.\d+/.test(version)) throw new Error('No usable version reported')
      return { name, binary, available: true, reason: version }
    }
    catch {
      return { name, available: false, reason: 'unavailable on PATH or offline version probe failed' }
    }
  }))
}
