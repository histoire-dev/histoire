import type { createContextMenu } from '../composables/context-menu.js'
import type { ShellStore } from '../stores/shell.js'
import type { createShortcutRegistry } from '../util/shortcuts.js'
import { HISTOIRE_SHOW_UI, HISTOIRE_TOGGLE_UI, useHistoireContext, useHistoireResource } from '@histoire/vue/internal'
import { nextTick, onMounted } from 'vue'
import { registerUiVisibilityAction } from './ui-visibility-menu.js'

/** Provider-owned visibility actions share eligibility, transient cleanup and focus. */
interface WorkbenchUiVisibilityOptions {
  /** Session-local shell whose panel preferences survive hiding. */
  shell: ShellStore
  /** Workbench keyboard registry, also used for menu hints. */
  shortcuts: ReturnType<typeof createShortcutRegistry>
  /** Transient context menu closed before its chrome disappears. */
  menu: ReturnType<typeof createContextMenu>
  /** Whether the current route has a story canvas to hide. */
  canHide: () => boolean
  /** Retire other transient interactions, including comment placement. */
  beforeToggle: () => void
}

/** Register visibility commands and finite iframe intents for this provider's lifetime. */
export function useWorkbenchUiVisibility(options: WorkbenchUiVisibilityOptions): () => void {
  const context = useHistoireContext()
  const { shell, shortcuts, menu } = options
  let root: HTMLElement | null = null
  /** Hidden chrome can always be restored, even after route eligibility changes. */
  const canToggle = () => shell.uiHidden.value || options.canHide()
  /** Close transient interactions while preserving the focused story document. */
  function toggleUi(): void {
    if (!canToggle()) return
    const wasHidden = shell.uiHidden.value
    const activeElement = root?.ownerDocument.activeElement
    menu.close()
    options.beforeToggle()
    shell.toggleUi()
    // Focused chrome unmounts on hide; keep subsequent scoped shortcuts reachable.
    if (!wasHidden && activeElement?.tagName !== 'IFRAME') {
      void nextTick(() => root?.querySelector<HTMLElement>('.histoire-canvas-viewport')?.focus({ preventScroll: true }))
    }
  }
  /** Escape restores once; delayed or repeated intents never hide visible chrome. */
  function showUi(): void {
    if (shell.uiHidden.value) toggleUi()
  }
  /** Only this exact provider can request its own visibility change. */
  function requestToggle(event: Event): void {
    if (event.defaultPrevented || event.target !== root) return
    event.preventDefault()
    toggleUi()
  }
  /** Visible chrome leaves unneeded restore intents unclaimed. */
  function requestShow(event: Event): void {
    if (event.defaultPrevented || event.target !== root || !shell.uiHidden.value) return
    event.preventDefault()
    showUi()
  }
  useHistoireResource(shortcuts.bind('global.toggle-ui', toggleUi, { allowInput: true, enabled: canToggle }))
  useHistoireResource(shortcuts.bind('global.show-ui', showUi, { allowInput: true, enabled: () => shell.uiHidden.value }))
  useHistoireResource(registerUiVisibilityAction(menu, { hidden: () => shell.uiHidden.value, available: canToggle, toggle: toggleUi }))
  onMounted(() => {
    root = context.root.value
    root?.addEventListener(HISTOIRE_TOGGLE_UI, requestToggle)
    root?.addEventListener(HISTOIRE_SHOW_UI, requestShow)
  })
  useHistoireResource(() => {
    root?.removeEventListener(HISTOIRE_TOGGLE_UI, requestToggle)
    root?.removeEventListener(HISTOIRE_SHOW_UI, requestShow)
    root = null
  })
  return toggleUi
}
