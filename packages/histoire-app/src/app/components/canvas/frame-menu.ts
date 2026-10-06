import type { createContextMenu } from '../../composables/context-menu.js'
import type { FrameActionTarget } from '../../util/frame-actions.js'
import { isContextMenuShortcut } from '../../composables/context-menu.js'

/** Detect keyboard equivalents of a browser context-menu request. */
export function isFrameMenuShortcut(event: KeyboardEvent): boolean {
  return isContextMenuShortcut(event)
}

/** Capture frame identity through the shared menu path without selecting it. */
export function openFrameMenu(menu: ReturnType<typeof createContextMenu> | undefined, event: MouseEvent | KeyboardEvent, target: FrameActionTarget): void {
  menu?.open(event, target)
}
