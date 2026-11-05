import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { win32 } from 'node:path'

/** Bounded escalation and pipe shutdown for one owned process group. */
interface ProcessTreeTimeouts {
  /** Grace period before forcing descendants to exit. */ terminate?: number
  /** Time allowed for group disappearance after SIGKILL. */ killed?: number
  /** Time allowed for direct process exit evidence. */ exit?: number
  /** Time allowed for inherited pipes to close. */ close?: number
  /** Interval between process-group probes. */ poll?: number
  /** Deadline for Windows taskkill. */ windows?: number
  /** Existing caller's public forced-termination error. */ failureMessage?: string
  /** Windows directory inherited by the spawned process. */ systemRoot?: string
}

/** Repeated stops join the same shutdown and never signal a reused PID. */
const stopping = new WeakMap<ChildProcess, Promise<void>>()

/** Wait for lifecycle evidence without letting inherited pipes block forever. */
async function settles(operation: Promise<void>, timeout: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation.then(() => true), new Promise<boolean>(resolve => timer = setTimeout(() => resolve(false), timeout))])
  }
  finally { clearTimeout(timer) }
}

/** Stop an owned detached child and its descendants, escalating before closing pipes. */
export function stopProcessTree(child: ChildProcess, timeouts: ProcessTreeTimeouts = {}): Promise<void> {
  const previous = stopping.get(child)
  if (previous) return previous
  const operation = stop()
  stopping.set(child, operation)
  return operation

  /** Signal only the process group minted by this child, even after leader exit. */
  function signalGroup(signal: NodeJS.Signals | 0): boolean {
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
  /** Escalate descendants independently of leader lifecycle and inherited pipes. */
  async function stop(): Promise<void> {
    let ended = child.exitCode !== null || child.signalCode !== null || !child.pid
    let exited!: () => void
    let closed!: () => void
    const exit = new Promise<void>(resolve => exited = resolve)
    const close = new Promise<void>(resolve => closed = resolve)
    /** Both spawn errors and exit events settle direct process ownership. */
    function onExit() {
      ended = true
      exited()
    }
    child.once('exit', onExit)
    child.once('error', onExit)
    child.once('close', closed)
    try {
      if (process.platform === 'win32') {
        if (child.pid && !ended) {
          const killer = spawn(win32.join(timeouts.systemRoot ?? process.env.SystemRoot ?? 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true, shell: false, timeout: timeouts.windows ?? 2000 })
          await new Promise<void>((resolve) => {
            killer.once('error', () => resolve())
            killer.once('close', () => resolve())
          })
          if (!ended) child.kill('SIGKILL')
        }
      }
      else {
        let alive = signalGroup('SIGTERM')
        const deadline = Date.now() + (timeouts.terminate ?? 1000)
        while (alive && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, timeouts.poll ?? 20))
          alive = signalGroup(0)
        }
        if (alive) {
          signalGroup('SIGKILL')
          const killedDeadline = Date.now() + (timeouts.killed ?? 250)
          // Orphaned zombies can remain visible until the OS reaps them.
          while (signalGroup(0) && Date.now() < killedDeadline) await new Promise(resolve => setTimeout(resolve, timeouts.poll ?? 20))
        }
      }
      const terminated = ended || await settles(exit, timeouts.exit ?? 1000)
      // Let ordinary output drain before forcing inherited pipes closed.
      await settles(close, timeouts.close ?? 250)
      child.stdin?.destroy()
      child.stdout?.destroy()
      child.stderr?.destroy()
      await settles(close, timeouts.close ?? 250)
      if (!terminated) throw new Error(timeouts.failureMessage ?? 'Process did not exit after forced termination')
    }
    finally {
      child.removeListener('exit', onExit)
      child.removeListener('error', onExit)
      child.removeListener('close', closed)
    }
  }
}
