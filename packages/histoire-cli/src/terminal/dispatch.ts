import type { ActionHost } from './actions.js'
import type { TerminalKey } from './keys.js'
import type { TerminalView, ViewRegistry } from './views/registry.js'
import { guarded, MAIN_ACTIONS } from './actions.js'

/** What key routing can do; implemented by the session. */
export interface DispatchContext {
  actions: ActionHost
  registry: ViewRegistry
  /** View currently owning the screen. */
  activeView: () => TerminalView | undefined
  /** Gives a view the screen. */
  openView: (view: TerminalView) => void
  /** Returns to the main screen. */
  closeView: () => void
  /** Releases the terminal and stops the process until resumed (Unix job control). */
  suspend: () => void
}

/**
 * Routes one key. Order is the whole contract:
 * 1. Ctrl+C always quits, even while a search prompt is open.
 * 2. An open screen owns the keys: a text prompt gets all of them, otherwise the view
 *    may consume the key, and unconsumed Escape or `q` returns to main. Main actions
 *    never fire inside a screen.
 * 3. On the main screen, a registered view shortcut opens it, a main action runs, and
 *    a contracted but unregistered shortcut reports that it is unavailable.
 * @param context Session capabilities.
 * @param key Decoded key.
 */
export function dispatchKey(context: DispatchContext, key: TerminalKey): void {
  if (key.ctrl) {
    if (key.name === 'c') context.actions.quit()
    else if (key.name === 'z') context.suspend()
    return
  }
  const view = context.activeView()
  if (view) {
    if (view.capturesInput?.()) {
      view.handleKey?.(key)
      return
    }
    if (view.handleKey?.(key)) return
    if (key.name === 'escape' || key.char === 'q') context.closeView()
    return
  }
  const char = key.char
  if (!char) return
  const target = context.registry.byShortcut(char)
  if (target) {
    if (target.run) void guarded(context.actions, () => target.run!())
    else context.openView(target)
    return
  }
  const action = MAIN_ACTIONS.find(item => item.key === char)
  if (action) {
    void guarded(context.actions, () => action.run(context.actions))
    return
  }
  const unavailable = context.registry.unavailableLabel(char)
  if (unavailable) context.actions.report(`${unavailable} is not available yet`)
}
