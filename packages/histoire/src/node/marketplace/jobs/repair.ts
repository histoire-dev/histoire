import type { ChangePlan, ChangeRequest } from '@histoire/shared'
import type { JobReceipt } from './receipt.js'
import type { ProjectSnapshot } from './snapshot.js'
import { lstat } from 'node:fs/promises'
import path from 'pathe'
import { frozenInstallArgv } from '../changes/package-manager.js'
import { readInstalledPackage } from '../inventory/package-resolve.js'
import { restoreProject } from './snapshot.js'
import { spawnPackage } from './spawn.js'

/** Durable installed-version evidence paired with the pre-command file snapshot. */
export interface RepairReceipt extends JobReceipt {
  /** Actual installed version before the job; never inferred from a manifest range. */ installedVersion?: string
}

/** Recovery inputs captured before executing the original package command. */
interface DependencyRepair {
  /** Project directory used by the original command. */ root: string
  /** Exact manifest and lockfile bytes captured before execution. */ snapshot: ProjectSnapshot
  /** Package intent whose installed state must be restored. */ request: ChangeRequest
  /** Detected manager from the verified plan. */ manager: ChangePlan['packageManager']['name']
  /** Reviewed argv, including any pnpm workspace flag. */ argv: string[]
  /** Already resolved executable, reused without shell resolution. */ binary: string
  /** Installed version observed before the original package step. */ version?: string
  /** Fresh cancellation signal, independent of the original failed command. */ signal: AbortSignal
  /** Sanitized bounded job output sink. */ output: (text: string, stream: 'stdout' | 'stderr') => void
  /** Same environment used for the original package command. */ environment: NodeJS.ProcessEnv
}

/** Uses lstat so a dangling package symlink still counts as a leftover. */
async function packageExists(root: string, id: string): Promise<boolean> {
  try {
    await lstat(path.join(root, 'node_modules', id))
    return true
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

/** Repairs dependencies only against restored inputs, then proves installed state. */
export async function repairDependencies(options: DependencyRepair): Promise<{ /** All inputs and installed state recovered. */ restored: boolean, /** Paths still requiring manual recovery. */ leftovers: string[] }> {
  const { root, snapshot, request, signal, output, environment } = options
  const leftovers = await restoreProject(snapshot)
  let verified = false
  if (!leftovers.length) {
    output('Restoring dependencies\n', 'stdout')
    try {
      let yarnVersion = ''
      if (options.manager === 'yarn') {
        // This runner has no earlier version probe; collect it through the same
        // cancellable argv-only boundary and retain its sanitized log output.
        await spawnPackage([options.binary, '--version'], root, signal, (text, stream) => {
          if (stream === 'stdout') yarnVersion = (yarnVersion + text).slice(0, 128)
          output(text, stream)
        }, environment)
      }
      const argv = await frozenInstallArgv(root, options.manager, options.argv, yarnVersion.trim())
      await spawnPackage([options.binary, ...argv.slice(1)], root, signal, output, environment)
      verified = request.kind === 'install'
        ? !await packageExists(root, request.id)
        : typeof options.version === 'string' && (await readInstalledPackage(root, request.id)).version === options.version
      signal.throwIfAborted()
    }
    catch {
      verified = false
      output('Dependency restoration failed\n', 'stderr')
    }
    finally {
      // Even frozen commands can rewrite metadata. Keep the exact-bytes promise
      // after success, failure or cancellation, once their process tree has exited.
      leftovers.push(...await restoreProject(snapshot))
    }
  }
  if (!verified) {
    leftovers.push('node_modules')
    if (await packageExists(root, request.id).catch(() => true)) leftovers.push(`node_modules/${request.id}`)
  }
  return { restored: verified && !leftovers.length, leftovers }
}
