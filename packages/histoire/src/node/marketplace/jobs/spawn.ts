import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import crossSpawn from 'cross-spawn'
import { stopProcessTree } from '../../util/stop-process-tree.js'

/** Resolves supported manager executables without invoking shell resolution. */
export async function resolveBinary(name: string, environment: NodeJS.ProcessEnv = process.env): Promise<string> {
  const extensions = process.platform === 'win32' ? (environment.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : ['']
  for (const directory of (environment.PATH ?? '').split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const file = join(directory, `${name}${extension}`)
      try {
        await access(file, constants.X_OK)
        return file
      }
      catch { /* Missing PATH entries do not prevent trying the next executable. */ }
    }
  }
  throw new Error(`Package manager ${name} is unavailable. Run the command manually.`)
}

/** Runs argv in an isolated process group; cancellation joins tree termination. */
export async function spawnPackage(argv: string[], root: string, signal: AbortSignal, output: (text: string, stream: 'stdout' | 'stderr') => void, environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  signal.throwIfAborted()
  const child = crossSpawn(argv[0], argv.slice(1), { cwd: root, env: { ...environment, CI: '1' }, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  /** Join shared descendant cleanup with the package manager's grace period. */
  function stop(): Promise<void> {
    return stopProcessTree(child, { terminate: 3000, poll: 25, windows: 3000, systemRoot: environment.SystemRoot })
  }
  /** Starts termination immediately when cancellation arrives. */
  const cancel = () => {
    void stop().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  const decoders = [new StringDecoder('utf8'), new StringDecoder('utf8')]
  for (const [index, stream] of [child.stdout!, child.stderr!].entries()) {
    stream.on('data', chunk => output(decoders[index].write(chunk), index === 0 ? 'stdout' : 'stderr'))
    stream.on('end', () => output(decoders[index].end(), index === 0 ? 'stdout' : 'stderr'))
  }
  try {
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => {
        void stop().catch(() => {})
        resolve(code)
      })
    })
    const closed = new Promise<void>(resolve => child.once('close', () => resolve()))
    const code = await exited
    await stop()
    await closed
    signal.throwIfAborted()
    if (code !== 0) throw new Error(`Package manager exited with code ${code}`)
  }
  finally {
    signal.removeEventListener('abort', cancel)
    await stop()
  }
}
