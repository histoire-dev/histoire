import type { UiAgentSettings } from '@histoire/shared'
import { spawn } from 'node:child_process'
import { win32 } from 'node:path'
import path from 'pathe'

/** Waits for lifecycle evidence without allowing inherited pipes to hold shutdown forever. */
async function settles(operation: Promise<void>, timeout: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout>
  try {
    return await Promise.race([operation.then(() => true), new Promise<boolean>(resolve => timer = setTimeout(() => resolve(false), timeout))])
  }
  finally { clearTimeout(timer) }
}

/** Launch one executable in its own POSIX process group, never through a shell. */
export function launchAgentProcess(preset: UiAgentSettings['presets'][number], root: string, environment: Record<string, string>) {
  const posix = process.platform !== 'win32'
  const child = spawn(preset.command, preset.args ?? [], {
    cwd: path.resolve(root, preset.cwd ?? '.'),
    env: { ...process.env, ...environment },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: posix,
    windowsHide: true,
    shell: false,
  })
  let ended = false
  const exit = new Promise<void>((resolve) => {
    child.once('exit', () => {
      ended = true
      resolve()
    })
    child.once('error', () => {
      ended = true
      resolve()
    })
  })
  const exited = new Promise<void>(resolve => child.once('close', () => resolve()))
  let stopping: Promise<void> | undefined
  /** Only the group minted by this spawn is signalled, including after adapter exit. */
  function signalGroup(signal: NodeJS.Signals | 0): boolean {
    if (!child.pid || !posix) return false
    try {
      process.kill(-child.pid, signal)
      return true
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
      throw error
    }
  }
  /** Windows has no POSIX groups; OS tree termination uses a bounded PID-only command. */
  async function stopWindowsTree(): Promise<void> {
    if (!child.pid || ended) return
    const killer = spawn(win32.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, shell: false, timeout: 2000 })
    await new Promise<void>((resolve) => {
      killer.once('error', () => resolve())
      killer.once('close', () => resolve())
    })
    if (!ended) child.kill('SIGKILL')
  }
  /** Escalate the entire owned group, then close pipes independently of the direct exit. */
  function stop(): Promise<void> {
    return stopping ??= (async () => {
      if (posix) {
        let alive = signalGroup('SIGTERM')
        const deadline = Date.now() + 1000
        // A worker may ignore SIGTERM after its parent exits and closes its own pipes.
        while (alive && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 20))
          alive = signalGroup(0)
        }
        if (alive) {
          signalGroup('SIGKILL')
          const killedDeadline = Date.now() + 250
          // Group disappearance is independent of the leader's exit/close events.
          // Orphaned zombies may remain visible until the OS reaps them.
          while (signalGroup(0) && Date.now() < killedDeadline) await new Promise(resolve => setTimeout(resolve, 20))
        }
      }
      else {
        await stopWindowsTree()
      }
      const terminated = ended || await settles(exit, 1000)
      child.stdin.destroy()
      child.stdout.destroy()
      child.stderr.destroy()
      await settles(exited, 250)
      if (!terminated) throw new Error('Agent process did not exit after forced termination')
    })()
  }
  // Natural/crashing adapter exit also retires inherited workers promptly; a
  // retained manager record never signals an old PID weeks after it was reaped.
  child.once('exit', () => {
    void stop().catch(() => {})
  })
  return { child, exited, stop }
}
