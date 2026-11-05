import type { ChangePlan, MarketplacePrefs } from '@histoire/shared'
import { access, readFile } from 'node:fs/promises'
import { executablePackageManagers } from '@histoire/shared'
import path from 'pathe'

/** Detected manager plus pnpm's workspace-root install requirement. */
export type DetectedPackageManager = ChangePlan['packageManager'] & {
  /** Current project is the pnpm workspace root. */ workspaceRoot: boolean
}
// Existing job and change-editor consumers still import this path.
export { displayCommand, packageCommand } from '@histoire/shared'

/** Lockfile names in stable manager precedence within one directory. */
export const lockfiles = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lock', 'bun.lockb'] as const

/** Tests existence without treating permission or IO errors as absence. */
async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/**
 * Read JSON without swallowing malformed manifests or IO failures.
 * @param file Absolute manifest path.
 * @param cache Parsed inputs retained only within one plan computation.
 */
export async function readPackage(file: string, cache?: Map<string, Record<string, unknown>>): Promise<Record<string, unknown>> {
  if (cache?.has(file)) return cache.get(file)!
  let data: Record<string, unknown>
  try {
    data = JSON.parse(await readFile(file, 'utf8'))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    data = {}
  }
  cache?.set(file, data)
  return data
}

/**
 * Find the nearest workspace; isolated roots never inherit foreign locks.
 * @param root Project directory.
 * @param cache Parsed inputs shared with manager detection within this plan only.
 */
export async function findWorkspaceRoot(root: string, cache?: Map<string, Record<string, unknown>>): Promise<string> {
  root = path.resolve(root)
  for (let directory = root; ; directory = path.dirname(directory)) {
    const data = await readPackage(path.join(directory, 'package.json'), cache)
    if (await exists(path.join(directory, 'pnpm-workspace.yaml')) || data.workspaces) return directory
    if (path.dirname(directory) === directory) return root
  }
}

/**
 * Detect override, packageManager, then nearest lockfile inside a workspace.
 * @param root Project directory.
 * @param override Browser preference.
 * @param boundary Already discovered workspace root, avoiding another ancestor walk.
 * @param cache Parsed inputs shared with workspace discovery within this plan only.
 */
export async function detectPackageManager(root: string, override: MarketplacePrefs['packageManager'], boundary?: string, cache = new Map<string, Record<string, unknown>>()): Promise<DetectedPackageManager | undefined> {
  root = path.resolve(root)
  const workspaceRoot = await exists(path.join(root, 'pnpm-workspace.yaml'))
  if (override !== 'auto') return { name: override, source: 'override', workspaceRoot }
  const project = await readPackage(path.join(root, 'package.json'), cache)
  const declared = typeof project.packageManager === 'string' ? /^(pnpm|npm|yarn|bun)@\S+$/.exec(project.packageManager)?.[1] : undefined
  if (declared) return { name: declared as DetectedPackageManager['name'], source: 'packageManager', workspaceRoot }
  boundary ??= await findWorkspaceRoot(root, cache)
  for (let directory = root; ; directory = path.dirname(directory)) {
    const data = await readPackage(path.join(directory, 'package.json'), cache)
    if (directory !== root && typeof data.packageManager === 'string') {
      const name = /^(pnpm|npm|yarn|bun)@\S+$/.exec(data.packageManager)?.[1]
      if (name) return { name: name as DetectedPackageManager['name'], source: 'packageManager', workspaceRoot }
    }
    for (const [index, file] of lockfiles.entries()) {
      if (await exists(path.join(directory, file))) return { name: executablePackageManagers[Math.min(index, 3)], source: 'lockfile', workspaceRoot }
    }
    if (directory === boundary) break
  }
}

/** Restores the reviewed dependency graph without saving a new dependency intent. */
export async function frozenInstallArgv(root: string, manager: ChangePlan['packageManager']['name'], reviewedArgv: string[], yarnVersion?: string): Promise<string[]> {
  if (manager === 'pnpm') return ['pnpm', 'install', '--frozen-lockfile', ...(reviewedArgv.includes('-w') ? ['-w'] : [])]
  if (manager === 'bun') return ['bun', 'install', '--frozen-lockfile']
  const boundary = await findWorkspaceRoot(root)
  // Locks and Yarn configuration may belong to a parent workspace rather than
  // the package being repaired. Stay within the same snapshot boundary.
  let berry = yarnVersion !== undefined && Number.parseInt(yarnVersion, 10) >= 2
  for (let directory = path.resolve(root); ; directory = path.dirname(directory)) {
    if (manager === 'npm' && await exists(path.join(directory, 'package-lock.json'))) return ['npm', 'ci']
    if (manager === 'yarn') {
      const data = await readPackage(path.join(directory, 'package.json'))
      berry ||= await exists(path.join(directory, '.yarnrc.yml')) || /^yarn@(?:[2-9]|\d{2,})\./.test(String(data.packageManager))
    }
    if (directory === boundary) break
  }
  return manager === 'npm' ? ['npm', 'install', '--no-save'] : ['yarn', 'install', berry ? '--immutable' : '--frozen-lockfile']
}
