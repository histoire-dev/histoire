import type { UiAgentSettings } from '@histoire/shared'
import crossSpawn from 'cross-spawn'
import path from 'pathe'
import { stopProcessTree } from '../util/stop-process-tree.js'

/** Launch one executable in its own POSIX process group, never through a shell. */
export function launchAgentProcess(preset: UiAgentSettings['presets'][number], root: string, environment: Record<string, string>) {
  const posix = process.platform !== 'win32'
  const child = crossSpawn(preset.command, preset.args ?? [], {
    cwd: path.resolve(root, preset.cwd ?? '.'),
    env: { ...process.env, ...environment },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: posix,
    windowsHide: true,
    shell: false,
  })
  const exited = new Promise<void>(resolve => child.once('close', () => resolve()))
  /** Repeated requests join shutdown of this invocation's process tree. */
  function stop(): Promise<void> {
    return stopProcessTree(child, { failureMessage: 'Agent process did not exit after forced termination' })
  }
  // Natural/crashing adapter exit also retires inherited workers promptly; a
  // retained manager record never signals an old PID weeks after it was reaped.
  /** Spawn failures also release pipes without leaving an unhandled error event. */
  function ended() {
    void stop().catch(() => {})
  }
  child.once('exit', ended)
  child.once('error', ended)
  return { child, exited, stop }
}
