import type { ChildProcess } from 'node:child_process'

/** Bounded exact-child exit wait; early exit never leaves timer retained. */
export async function waitForChildExit(child: ChildProcess, exited: Promise<void>, milliseconds: number) {
  if (child.exitCode !== null || child.signalCode !== null) return true
  let timer: ReturnType<typeof setTimeout>
  try {
    return await Promise.race([exited.then(() => true), new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), milliseconds)
    })])
  }
  finally { clearTimeout(timer) }
}
