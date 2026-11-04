import type { ClipboardWriter } from './clipboard.js'
import type { TestsConsole } from './tests/console.js'

/** Capabilities the main actions use; implemented by the session for both TUI and plain modes. */
export interface ActionHost {
  /** Starts a replacement runtime; resolves when the proxy accepted the request. */
  restart: (request: { fresh: boolean }) => Promise<void>
  /** Opens the workbench URL in the default browser. */
  openBrowser: () => Promise<void>
  /** Workbench URL when known. */
  url: () => string | undefined
  /** Writes to the system clipboard. */
  copy: ClipboardWriter
  /** Empties the visible output; retained history stays. */
  clearScreen: () => void
  /** Starts graceful shutdown. */
  quit: () => void
  /** Manual test controller; absent in doubles that never run tests. */
  tests?: TestsConsole
  /** Shows one feedback message (transient panel line, or a printed line in plain mode). */
  report: (text: string) => void
}

/** One main-screen action. */
export interface MainAction {
  key: string
  label: string
  description: string
  run: (host: ActionHost) => void | Promise<void>
}

/**
 * Runs an action body; failures become feedback instead of unhandled rejections.
 * @param host Action host receiving the feedback.
 * @param work Work to run.
 */
export async function guarded(host: ActionHost, work: () => void | Promise<void>): Promise<void> {
  try {
    await work()
  }
  catch (error) {
    host.report(`Failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Requests a runtime replacement; the lifecycle notice names the cause.
 * @param host Action host.
 * @param fresh Skip cached catalog and force dependency optimization.
 */
export function restartRuntime(host: ActionHost, fresh: boolean) {
  host.report(fresh ? 'Fresh restart requested' : 'Restart requested')
  // Not awaited by callers' keypress path: the proxy serializes and coalesces requests.
  return guarded(host, () => host.restart({ fresh }))
}

/**
 * Opens the workbench in the browser.
 * @param host Action host.
 */
export function openWorkbench(host: ActionHost) {
  return guarded(host, async () => {
    const url = host.url()
    if (!url) return host.report('Workbench address is not known yet')
    host.report('Opening workbench')
    await host.openBrowser()
  })
}

/**
 * Copies the workbench URL, reporting plainly when the clipboard is unavailable.
 * @param host Action host.
 */
function copyUrl(host: ActionHost) {
  return guarded(host, async () => {
    const url = host.url()
    if (!url) return host.report('Workbench address is not known yet')
    const result = await host.copy(url)
    host.report(result.ok ? `Copied address${result.note ? ` (${result.note})` : ''}` : `Copy unavailable: ${result.reason}`)
  })
}

/** Keys handled by the main screen itself, in help order. */
export const MAIN_ACTIONS: readonly MainAction[] = [
  { key: 'r', label: 'Restart', description: 'Restart the runtime', run: host => restartRuntime(host, false) },
  { key: 'R', label: 'Fresh restart', description: 'Restart without cached catalog or dependencies', run: host => restartRuntime(host, true) },
  { key: 'o', label: 'Open', description: 'Open the workbench in the browser', run: openWorkbench },
  { key: 'y', label: 'Copy', description: 'Copy the workbench address', run: copyUrl },
  { key: 'c', label: 'Clear', description: 'Clear the visible output', run: (host) => { host.clearScreen() } },
  { key: 'q', label: 'Quit', description: 'Stop and exit', run: (host) => { host.quit() } },
]

/** Keys main actions own; views may not take them. */
export const RESERVED_SHORTCUTS: readonly string[] = MAIN_ACTIONS.map(action => action.key)
