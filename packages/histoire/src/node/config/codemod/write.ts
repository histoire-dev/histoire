import type { ConfigAccessOptions } from './types.js'
import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { parseConfigCode } from './parse.js'
import { guardConfigFile, guardProjectPath } from './security.js'

/** Original source hash required by the explicit settings save request. */
export interface WriteConfigOptions extends ConfigAccessOptions {
  /** Hash received by the client, or undefined only for a missing config. */
  expectedHash: string | undefined
}

/** Backups created by this runtime, never backups from another process/session. */
const sessionBackups = new Map<string, Set<string>>()
/** Per-file queue preventing simultaneous saves from overwriting each other. */
const writes = new Map<string, Promise<unknown>>()

/** Hashes exact config bytes for disk-conflict detection. */
export function hashConfigCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/** Reads a validated config hash, returning undefined only when file is absent. */
export async function configFileHash(file: string, options: ConfigAccessOptions = {}): Promise<string | undefined> {
  const safe = await guardConfigFile(file, options)
  try {
    return hashConfigCode(await readFile(safe, 'utf8'))
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Writes a parsed preview atomically, preserving a rollback copy for this session. */
export async function writeConfig(file: string, code: string, options: WriteConfigOptions): Promise<{ hash: string, backup?: string }> {
  const safe = await guardConfigFile(file, options)
  const prior = writes.get(safe) ?? Promise.resolve()
  const next = prior.catch(() => {}).then(() => writeConfigNow(file, safe, code, options))
  writes.set(safe, next)
  try {
    return await next
  }
  finally {
    if (writes.get(safe) === next) writes.delete(safe)
  }
}

/** Performs a queued write with two conflict checks around temporary-file IO. */
async function writeConfigNow(file: string, safe: string, code: string, options: WriteConfigOptions): Promise<{ hash: string, backup?: string }> {
  parseConfigCode(code)
  if (await configFileHash(file, options) !== options.expectedHash) throw new Error('config changed on disk, reload settings')
  const root = path.resolve(options.root ?? process.cwd())
  let backup: string | undefined
  if (options.expectedHash !== undefined) {
    const directory = path.join(root, '.histoire', 'config-backup')
    await guardProjectPath(directory, root)
    await mkdir(directory, { recursive: true })
    await guardProjectPath(directory, root)
    backup = path.join(directory, `${Date.now()}-${randomUUID()}`)
    await writeFile(backup, await readFile(safe), { flag: 'wx', mode: 0o600 })
    const owned = sessionBackups.get(root) ?? new Set<string>()
    owned.add(backup)
    sessionBackups.set(root, owned)
  }
  const temporary = path.join(path.dirname(safe), `.histoire-config-${randomUUID()}.tmp`)
  try {
    const mode = options.expectedHash === undefined ? 0o644 : (await stat(safe)).mode
    await writeFile(temporary, code, { flag: 'wx', mode })
    if (await guardConfigFile(file, options) !== safe || await configFileHash(file, options) !== options.expectedHash) {
      throw new Error('config changed on disk, reload settings')
    }
    if (options.expectedHash === undefined) {
      // link is atomic and refuses a concurrently created destination; rename
      // would overwrite it after the missing-file hash check.
      try {
        await link(temporary, safe)
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('config changed on disk, reload settings')
        throw error
      }
    }
    else {
      await rename(temporary, safe)
    }
    return { hash: hashConfigCode(code), backup }
  }
  finally {
    await rm(temporary, { force: true })
  }
}

/** Restores a session backup only while the just-saved config is still current. */
export async function restoreConfigBackup(file: string, backup: string, options: WriteConfigOptions): Promise<{ hash: string }> {
  const root = path.resolve(options.root ?? process.cwd())
  if (!sessionBackups.get(root)?.has(backup)) throw new Error('Config backup does not belong to this session')
  const safeBackup = await guardProjectPath(backup, root)
  return writeConfig(file, await readFile(safeBackup, 'utf8'), options)
}

/** Removes only backups allocated by this runtime when its dev session ends. */
export async function cleanupConfigBackups(root: string): Promise<void> {
  const project = path.resolve(root)
  const backups = sessionBackups.get(project)
  if (!backups) return
  for (const backup of backups) {
    const safe = await guardProjectPath(backup, project)
    await rm(safe, { force: true })
  }
  sessionBackups.delete(project)
}
