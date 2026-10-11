import { createReadStream, createWriteStream } from 'node:fs'
import { chmod, mkdir, realpath, symlink } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { extract, list } from 'tar'
import yauzl from 'yauzl'

/** Resolve portable archive paths while rejecting absolute paths and root escapes. */
export function archivePath(root: string, name: string, relativeTo = root): string {
  const portable = name.replace(/\\/g, '/')
  if (/^(?:\/|[a-z]:)/i.test(portable)) throw new Error('Agent archive contains an unsafe path')
  const target = path.resolve(relativeTo, portable)
  const relative = path.relative(root, target)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Agent archive contains an unsafe path')
  return target
}

/** ZIP extraction controls symlinks before creating them, and never overwrites entries. */
async function extractZip(file: string, root: string, signal: AbortSignal): Promise<void> {
  const zip = await promisify(yauzl.open)(file, { lazyEntries: true })
  const seen = new Set<string>()
  let total = 0
  await new Promise<void>((resolve, reject) => {
    /** Close ZIP and terminate its current stream on failure or cancellation. */
    function fail(error: unknown): void {
      zip.close()
      reject(error)
    }
    const abort = () => fail(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    zip.on('error', fail)
    zip.on('end', resolve)
    zip.once('close', () => signal.removeEventListener('abort', abort))
    zip.on('entry', (entry) => {
      /** Each entry waits for real extraction before requesting the next header. */
      async function write(): Promise<void> {
        signal.throwIfAborted()
        const destination = archivePath(root, entry.fileName)
        const mode = (entry.externalFileAttributes >>> 16) & 0xFFFF
        const directory = entry.fileName.endsWith('/') || (mode & 0o170000) === 0o040000
        total += entry.uncompressedSize
        if (seen.has(destination) || seen.size >= 50_000 || total > 1024 * 1024 * 1024) throw new Error('Agent archive contains duplicate entries or exceeds extraction limit')
        seen.add(destination)
        await mkdir(directory ? destination : path.dirname(destination), { recursive: true })
        // Earlier contained links can redirect a parent; verify its canonical location.
        const parent = await realpath(directory ? destination : path.dirname(destination))
        archivePath(root, path.relative(root, parent))
        if (directory) return
        const stream = await promisify(zip.openReadStream.bind(zip))(entry)
        if ((mode & 0o170000) === 0o120000) {
          let target = ''
          for await (const chunk of stream) {
            target += chunk.toString()
            if (target.length > 4096) throw new Error('Agent archive link is too long')
          }
          archivePath(root, target, path.dirname(destination))
          await symlink(target, destination)
        }
        else {
          await pipeline(stream, createWriteStream(destination, { flags: 'wx', mode: mode & 0o777 || 0o644 }), { signal })
          await chmod(destination, mode & 0o777 || 0o644)
        }
      }
      void write().then(() => zip.readEntry()).catch(fail)
    })
    if (signal.aborted) abort()
    else zip.readEntry()
  })
}

/** Preflight TAR links before extraction; maintained tar library enforces symlink traversal. */
export async function extractAgentArchive(file: string, url: string, root: string, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  const extension = new URL(url).pathname
  await mkdir(root, { recursive: true })
  if (extension.endsWith('.zip')) return extractZip(file, root, signal)
  if (!/\.(?:tar\.gz|tgz)$/.test(extension)) throw new Error('Unsupported agent archive format')
  let total = 0
  let count = 0
  const parser = list({ onReadEntry(entry) {
    try {
      signal.throwIfAborted()
      const destination = archivePath(root, entry.path)
      if (entry.type === 'SymbolicLink') archivePath(root, entry.linkpath, path.dirname(destination))
      if (entry.type === 'Link') archivePath(root, entry.linkpath)
      if (!['File', 'Directory', 'SymbolicLink', 'Link', 'ExtendedHeader', 'GlobalExtendedHeader', 'OldFile', 'GNUDumpDir'].includes(entry.type)) throw new Error('Unsupported agent archive entry')
      total += entry.size
      if (++count > 50_000 || total > 1024 * 1024 * 1024) throw new Error('Agent archive exceeds extraction limit')
    }
    catch (error) { parser.abort(error as Error) }
  } })
  await pipeline(createReadStream(file), parser, { signal })
  signal.throwIfAborted()
  await pipeline(createReadStream(file), extract({ cwd: root, strict: true, preservePaths: false }), { signal })
}
