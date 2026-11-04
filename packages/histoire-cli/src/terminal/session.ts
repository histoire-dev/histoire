import type { ActionHost } from './actions.js'
import type { SessionHost, TerminalSession, TerminalSessionOptions } from './session-types.js'
import type { TerminalMode } from './support.js'
import type { TerminalView, TerminalViewHost } from './views/registry.js'
import { url as inspectorUrl } from 'node:inspector'
import { unavailableClipboard } from './clipboard.js'
import { dispatchKey } from './dispatch.js'
import { createFeedback } from './feedback.js'
import { createHostExtras } from './host-extras.js'
import { createKeyInput } from './keys.js'
import { buildPanelModel } from './panel-model.js'
import { renderPanel } from './panel.js'
import { createPlainInput, runPlainCommand } from './plain.js'
import { describeProgress } from './progress/format.js'
import { createRequestHistory } from './requests/history.js'
import { createShutdown } from './shutdown.js'
import { decideTerminalMode } from './support.js'
import { createSurface } from './surface.js'
import { createSessionTests } from './tests/session.js'
import { viewFactories } from './views/index.js'
import { createViewRegistry } from './views/registry.js'

export type { SessionHost, TerminalSession, TerminalSessionOptions } from './session-types.js'

/** A stop signal that did not actually stop this process (orphaned group) resumes after this delay. */
const SUSPEND_GRACE_MS = 300

/**
 * Creates the session before the proxy binds, without importing the project graph.
 * Throws for an invalid `HISTOIRE_TUI` so the command fails before any evaluation.
 * @param options Session inputs.
 */
export function createTerminalSession(options: TerminalSessionOptions): TerminalSession {
  const stdin = options.stdin ?? process.stdin
  const stdout = options.stdout ?? process.stdout
  const environment = options.environment ?? process.env
  const decide = () => decideTerminalMode({ flag: options.flag, env: environment.HISTOIRE_TUI, stdin, stdout, environment, execArgv: options.execArgv ?? process.execArgv, inspectorUrl: inspectorUrl() })
  const initial = decide()
  const explicit = options.flag === true || environment.HISTOIRE_TUI === '1'
  // Without any chance of an interactive panel there is nothing to watch or reclaim.
  const interactive = stdin.isTTY === true && stdout.isTTY === true && options.flag !== false && environment.HISTOIRE_TUI !== 'plain'
  /** `released` is the short window where a stopped process leaves the terminal to the shell. */
  let active: TerminalMode | 'released' | undefined
  let host: SessionHost | undefined
  /** Settles with the host once bound, so a shutdown requested during startup still closes it. */
  let hostBound!: (bound: SessionHost) => void
  const hostReady = new Promise<SessionHost>(resolve => (hostBound = resolve))
  let publicUrl: string | undefined
  let workbenchUrl: string | undefined
  let rendererFailed = false
  let suspended = false
  let closed = false
  let openView: TerminalView | undefined
  let tick: ReturnType<typeof setInterval> | undefined
  let announced: string | undefined
  const segments = new Set<() => string | undefined>()
  const url = () => workbenchUrl ?? publicUrl
  const plainLine = (text: string) => void stdout.write(`${text}\n`)
  const feedback = createFeedback(() => surface.repaint())

  /** Single feedback channel: transient panel line in the TUI, a printed line otherwise. */
  function report(text: string) {
    if (active === 'tui') feedback.show(text)
    else plainLine(text)
  }

  /** The proxy exists once a user can act; an earlier key is reported, not thrown. */
  function requireHost() {
    if (!host) throw new Error('Histoire is still starting')
    return host
  }

  const tests = createSessionTests(options, { report, plain: () => session.mode !== 'tui' })
  const actions: ActionHost = {
    tests,
    restart: request => requireHost().restart({ cause: 'manual', fresh: request.fresh }),
    openBrowser: async () => requireHost().openBrowser(url()!),
    url,
    copy: options.clipboard ?? unavailableClipboard,
    clearScreen: () => surface.clear(),
    quit: () => void session.shutdown().catch((error) => {
      console.error(error)
      process.exitCode = 1
    }),
    report,
  }

  const viewHost: TerminalViewHost = {
    bridge: options.bridge,
    logs: options.logs,
    requests: options.requests ?? createRequestHistory(),
    progress: options.progress,
    url,
    size: () => ({ columns: stdout.columns ?? 80, rows: stdout.rows ?? 24 }),
    notify: report,
    requestRender: () => surface.repaint(),
    close: () => closeView(),
    openView(shortcut) {
      const view = registry.byShortcut(shortcut)
      if (view) openScreen(view)
    },
    tests,
    copy: actions.copy,
    ...createHostExtras(options, () => publicUrl),
    openBrowser: async (path = '/') => requireHost().openBrowser(new URL(path, workbenchUrl ?? publicUrl).href),
    shortcuts: () => registry.summary(),
    addPanelSegment(provider) {
      segments.add(provider)
      surface.repaint()
      return () => void segments.delete(provider)
    },
  }

  /** Open view lines; feedback replaces the footer row. */
  function screenLines() {
    if (!openView?.render) return undefined
    const lines = openView.render(viewHost.size())
    const message = feedback.text()
    if (message && lines.length) lines[lines.length - 1] = message
    return lines
  }

  const surface = createSurface({
    stdout,
    content: {
      screen: screenLines,
      panel: () => renderPanel(buildPanelModel({ version: options.version, columns: stdout.columns ?? 80, snapshot: options.progress.snapshot(), url: url(), segments, feedback: feedback.text(), views: registry.list() })),
    },
    onFailure(error) {
      rendererFailed = true
      plainLine(`Terminal rendering failed (${error instanceof Error ? error.message : String(error)}). Using plain output`)
      applyMode()
    },
  })

  // Created after the surface: view factories may contribute panel segments, which repaint it.
  const registry = createViewRegistry(viewHost, options.viewFactories ?? viewFactories)

  /** Gives a view the screen; an open view (stories handing over to tests) leaves first. */
  function openScreen(view: TerminalView) {
    openView?.leave?.()
    openView = view
    view.enter?.()
    surface.repaint()
  }

  /** Returns to the main screen. */
  function closeView() {
    const view = openView
    openView = undefined
    view?.leave?.()
    surface.repaint()
  }

  const keys = createKeyInput({
    stdin,
    onKey: (key) => {
      if (closed) return
      try {
        dispatchKey({ actions, registry, activeView: () => openView, openView: openScreen, closeView, suspend }, key)
        // A handled key may have moved selection or scroll; screens do not repaint themselves.
        if (openView) surface.repaint()
      }
      catch (error) {
        report(`Failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    },
  })
  const plainInput = createPlainInput({ stdin, onLine: line => void (closed || runPlainCommand(actions, line)) })

  /** Releases view, raw input and panel; every step runs even if an earlier one failed. */
  function leaveTui() {
    clearInterval(tick)
    tick = undefined
    feedback.dispose()
    const view = openView
    openView = undefined
    for (const step of [() => view?.leave?.(), () => keys.detach(), () => surface.detach()]) {
      try {
        step()
      }
      catch {}
    }
  }

  /** Brings the screen in line with policy; the only place that switches modes. */
  function applyMode() {
    if (closed) return
    const wanted: TerminalMode | 'released' = suspended ? 'released' : rendererFailed ? 'plain' : decide().mode
    if (wanted === active) return
    const was = active
    if (was === 'tui') leaveTui()
    if (was === 'plain') plainInput.detach()
    active = wanted
    if (wanted === 'tui') {
      keys.attach()
      surface.attach()
      // A render failure during attach already switched to plain.
      if (active !== 'tui') return
      tick = setInterval(() => surface.repaint(), 1000)
      tick.unref()
    }
    else if (wanted === 'plain') {
      if (stdin.isTTY) plainInput.attach()
      if (was === 'tui' && !rendererFailed) plainLine('Terminal too small for the interactive panel, using plain output')
    }
  }

  /** Leaves the terminal in shell state and stops the process group like a terminal driver would, so `pnpm`/`npx` wrappers stop too (Unix job control). */
  function suspend() {
    if (process.platform === 'win32' || suspended) return
    suspended = true
    applyMode()
    // In an orphaned process group the stop signal is ignored; resume ourselves then.
    setTimeout(resume, SUSPEND_GRACE_MS).unref()
    ;(options.suspendProcess ?? (() => process.kill(0, 'SIGTSTP')))()
  }

  /** Re-detects the terminal after a stop; idempotent. */
  function resume() {
    if (!suspended) return
    suspended = false
    applyMode()
  }

  const onResize = () => {
    applyMode()
    if (active === 'tui') surface.repaint()
  }
  if (interactive) {
    stdout.on('resize', onResize)
    process.on('SIGCONT', resume)
  }
  const stopProgress = options.progress.subscribe((snapshot) => {
    if (active === 'tui') return surface.repaint()
    // Plain mode: one real line per readiness or failure, never per tick.
    const marker = snapshot.failed ? `failed:${snapshot.generation}:${snapshot.failed.phase}` : snapshot.status === 'ready' && snapshot.readyAfterMs !== undefined ? `ready:${snapshot.generation}` : undefined
    if (marker && marker !== announced) {
      announced = marker
      plainLine(`  ${describeProgress(snapshot)}`)
    }
  })

  /** Idempotent restoration of everything the session owns. */
  function release() {
    closed = true
    stopProgress()
    stdout.off('resize', onResize)
    process.off('SIGCONT', resume)
    if (active === 'tui') leaveTui()
    plainInput.detach()
    active = undefined
  }

  const shutdown = createShutdown({ release, close: () => host ? host.close() : hostReady.then(bound => bound.close()) })

  const session: TerminalSession = {
    passthrough: {
      stdout: { write: data => active === 'tui' ? surface.write('stdout', data) : stdout.write(data) },
      stderr: { write: data => active === 'tui' ? surface.write('stderr', data) : process.stderr.write(data) },
    },
    line: text => active === 'tui' ? surface.write('stdout', `${text}\n`) : plainLine(text),
    onListening(address) {
      publicUrl = address
      surface.repaint()
    },
    onReady(base) {
      if (publicUrl) workbenchUrl = new URL(base, publicUrl).href
      surface.repaint()
    },
    bind(bound) {
      host = bound
      hostBound(bound)
    },
    release,
    shutdown,
    get mode() {
      return active === 'tui' ? 'tui' : 'plain'
    },
    registry,
  }

  // Initial activation. An explicit request that cannot be honored is said once.
  applyMode()
  if (explicit && initial.mode === 'plain' && initial.reason) plainLine(`Interactive terminal unavailable (${initial.reason}), using plain output`)
  return session
}
