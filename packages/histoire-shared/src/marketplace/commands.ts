import type { ChangePlan, ChangeRequest } from '../types/marketplace.js'

/** Command inputs independent of package-manager discovery or filesystem access. */
export interface PackageCommandManager {
  /** Concrete executable. */ name: ChangePlan['packageManager']['name']
  /** Current project is the pnpm workspace root. */ workspaceRoot: boolean
}

/** Quote display-only words for POSIX shells; execution always uses argv. */
export function displayCommand(argv: string[]): string {
  return argv.map(word => /^[\w@./:=+-]+$/.test(word) ? word : `'${word.replace(/'/g, `'"'"'`)}'`).join(' ')
}

/** Generate command argv for a validated package change. */
export function packageCommand(manager: PackageCommandManager, request: Pick<ChangeRequest, 'kind' | 'id' | 'version'>): ChangePlan['command'] {
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
