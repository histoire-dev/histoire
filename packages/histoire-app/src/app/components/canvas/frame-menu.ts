import type { createContextMenu } from '../../composables/context-menu.js'
import type { FrameActionTarget } from '../../util/frame-actions.js'

/** Detect keyboard equivalents of a browser context-menu request. */
export function isFrameMenuShortcut(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}

/** Capture frame identity through the shared menu path without selecting it. */
export function openFrameMenu(menu: ReturnType<typeof createContextMenu> | undefined, event: MouseEvent | KeyboardEvent, target: FrameActionTarget): void {
  menu?.open(event, target)
}
