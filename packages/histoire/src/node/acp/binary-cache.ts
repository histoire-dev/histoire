import type { AgentDistribution } from './registry-schema.js'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'pathe'
import { archivePath, extractAgentArchive } from './archive.js'
import { downloadAgentArchive } from './download.js'

/** Atomic, content-addressed installs shared across preparation requests. */
export function createAgentBinaryCache(cacheDir: string, download = downloadAgentArchive) {
  const installs = new Map<string, Promise<string>>()
  /** Resolve expected executable only inside the installed archive tree. */
  async function executable(directory: string, command: string): Promise<string> {
    const candidate = archivePath(directory, command)
    const actual = await realpath(candidate)
    archivePath(directory, path.relative(directory, actual))
    if (!(await stat(actual)).isFile()) throw new Error('Agent archive did not contain executable')
    return candidate
  }
  return {
    /** Prepare one binary without deleting older versions used by active adapters. */
    async prepare(id: string, distribution: AgentDistribution, signal: AbortSignal): Promise<string> {
      if (!distribution.archive) throw new Error('Missing agent archive URL')
      if (!/^[\w-]{1,80}$/.test(id)) throw new Error('Invalid agent identity')
      const hash = createHash('sha256').update(JSON.stringify(distribution)).digest('hex')
      const directory = path.join(cacheDir, 'acp-binaries', id, hash)
      const marker = path.join(directory, '.histoire-installed')
      const key = directory
      let operation = installs.get(key)
      if (!operation) {
        operation = (async () => {
          signal.throwIfAborted()
          try {
            await readFile(marker)
            return await executable(directory, distribution.command)
          }
          catch { /* Missing or incomplete install is replaced atomically. */ }
          const temporary = `${directory}-${randomUUID()}.tmp`
          const archive = `${temporary}.archive`
          try {
            const bytes = await download(distribution.archive, signal)
            signal.throwIfAborted()
            if (distribution.sha256 && createHash('sha256').update(bytes).digest('hex') !== distribution.sha256.toLowerCase()) throw new Error('Agent archive checksum mismatch')
            await mkdir(path.dirname(directory), { recursive: true })
            await writeFile(archive, bytes, { flag: 'wx' })
            await extractAgentArchive(archive, distribution.archive, temporary, signal)
            const command = await executable(temporary, distribution.command)
            if (process.platform !== 'win32') await chmod(await realpath(command), 0o755)
            await writeFile(path.join(temporary, '.histoire-installed'), hash)
            signal.throwIfAborted()
            // A separate dev server may already have published identical content.
            try {
              await rename(temporary, directory)
            }
            catch (error) {
              if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code)) throw error
            }
            return await executable(directory, distribution.command)
          }
          finally { await Promise.all([rm(temporary, { recursive: true, force: true }), rm(archive, { force: true })]) }
        })().finally(() => installs.delete(key))
        installs.set(key, operation)
      }
      const result = await operation
      signal.throwIfAborted()
      return result
    },
  }
}
