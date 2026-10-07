import type { createContextMenu } from '../composables/context-menu.js'

/** Live workbench state keeps menu actions aligned with toolbar and shortcut behavior. */
export interface UiVisibilityMenuOptions {
  /** Whether this workbench's chrome is currently hidden. */
  hidden: () => boolean
  /** Shared eligibility gate for hiding or restoring chrome. */
  available: () => boolean
  /** Existing workbench toggle owns dismissal, transient state, and focus. */
  toggle: () => void
}

/** Register one reactive UI action for every menu owned by this workbench. */
export function registerUiVisibilityAction(menu: ReturnType<typeof createContextMenu>, options: UiVisibilityMenuOptions): () => void {
  return menu.register({
    id: 'global.toggle-ui',
    global: true,
    group: 'ui',
    shortcut: 'global.toggle-ui',
    /** Reflect live visibility without replacing the registered action. */
    get label() { return options.hidden() ? 'Show UI' : 'Hide UI' },
    /** Use existing offline glyphs for both visibility states. */
    get icon() { return options.hidden() ? 'screen' : 'screen-off' },
    available: options.available,
    run: options.toggle,
  })
}
