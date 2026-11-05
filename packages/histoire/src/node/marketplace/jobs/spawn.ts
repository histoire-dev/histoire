import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { delimiter, join, win32 } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import crossSpawn from 'cross-spawn'

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
  let stopping: Promise<void> | undefined
  /** Signals only this invocation's POSIX group, including inherited grandchildren. */
  function group(signal: NodeJS.Signals | 0): boolean {
    if (!child.pid) return false
    try {
      process.kill(-child.pid, signal)
      return true
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
      throw error
    }
  }
  /** Retires descendants even after a package-manager leader exits first. */
  function stop(): Promise<void> {
    return stopping ??= (async () => {
      if (!child.pid) return
      if (process.platform === 'win32') {
        const killer = crossSpawn(win32.join(environment.SystemRoot ?? 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { shell: false, stdio: 'ignore', windowsHide: true, timeout: 3000 })
        await new Promise<void>((resolve) => {
          killer.once('close', () => resolve())
          killer.once('error', () => resolve())
        })
        return
      }
      if (!group('SIGTERM')) return
      const deadline = Date.now() + 3000
      while (Date.now() < deadline && group(0)) await new Promise(resolve => setTimeout(resolve, 25))
      group('SIGKILL')
    })()
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
