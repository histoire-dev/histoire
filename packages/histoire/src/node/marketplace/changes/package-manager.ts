import type { ChangePlan, ChangeRequest, MarketplacePrefs } from '@histoire/shared'
import { access, readFile } from 'node:fs/promises'
import path from 'pathe'

/** Detected manager plus pnpm's workspace-root install requirement. */
export type DetectedPackageManager = ChangePlan['packageManager'] & {
  /** Current project is the pnpm workspace root. */ workspaceRoot: boolean
}
/** Supported executables; never resolved or run during planning. */
const managers = ['pnpm', 'npm', 'yarn', 'bun'] as const
/** Lockfile names in stable precedence within one directory. */
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

/** Reads JSON without swallowing malformed project manifests or IO failures. */
export async function readPackage(file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
}

/** Finds the nearest declared workspace; isolated roots never inherit foreign locks. */
export async function findWorkspaceRoot(root: string): Promise<string> {
  root = path.resolve(root)
  for (let directory = root; ; directory = path.dirname(directory)) {
    const data = await readPackage(path.join(directory, 'package.json'))
    if (await exists(path.join(directory, 'pnpm-workspace.yaml')) || data.workspaces) return directory
    if (path.dirname(directory) === directory) return root
  }
}

/** Detects override, packageManager, then nearest lockfile inside a workspace. */
export async function detectPackageManager(root: string, override: MarketplacePrefs['packageManager']): Promise<DetectedPackageManager | undefined> {
  root = path.resolve(root)
  const workspaceRoot = await exists(path.join(root, 'pnpm-workspace.yaml'))
  if (override !== 'auto') return { name: override, source: 'override', workspaceRoot }
  const project = await readPackage(path.join(root, 'package.json'))
  const declared = typeof project.packageManager === 'string' ? /^(pnpm|npm|yarn|bun)@\S+$/.exec(project.packageManager)?.[1] : undefined
  if (declared) return { name: declared as DetectedPackageManager['name'], source: 'packageManager', workspaceRoot }
  const boundary = await findWorkspaceRoot(root)
  for (let directory = root; ; directory = path.dirname(directory)) {
    const data = await readPackage(path.join(directory, 'package.json'))
    if (directory !== root && typeof data.packageManager === 'string') {
      const name = /^(pnpm|npm|yarn|bun)@\S+$/.exec(data.packageManager)?.[1]
      if (name) return { name: name as DetectedPackageManager['name'], source: 'packageManager', workspaceRoot }
    }
    for (const [index, file] of lockfiles.entries()) {
      if (await exists(path.join(directory, file))) return { name: managers[Math.min(index, 3)], source: 'lockfile', workspaceRoot }
    }
    if (directory === boundary) break
  }
}

/** Quotes display-only words for POSIX shells; execution always uses argv. */
export function displayCommand(argv: string[]): string {
  return argv.map(word => /^[\w@./:=+-]+$/.test(word) ? word : `'${word.replace(/'/g, `'"'"'`)}'`).join(' ')
}

/** Generates command argv for a validated, concrete package change. */
export function packageCommand(manager: DetectedPackageManager, request: Pick<ChangeRequest, 'kind' | 'id' | 'version'>): ChangePlan['command'] {
  if (request.kind === 'options') return undefined
  const name = manager.name
  const remove = request.kind === 'remove'
  const argv: string[] = [name, remove ? (name === 'npm' ? 'uninstall' : 'remove') : (name === 'npm' ? 'install' : 'add')]
  if (!remove) argv.push(name === 'bun' ? '-d' : '-D')
  if (name === 'pnpm' && manager.workspaceRoot) argv.push('-w')
  if (request.kind === 'pin') argv.push(name === 'pnpm' || name === 'npm' ? '--save-exact' : '-E')
  argv.push(remove ? request.id : `${request.id}@${request.version ?? 'latest'}`)
  return { argv, display: displayCommand(argv) }
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
