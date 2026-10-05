import type { InjectionKey } from 'vue'
import type { FrameActionTarget } from '../util/frame-actions.js'
import { inject, provide, shallowReactive } from 'vue'

/** Context target is captured independently of current URL selection. */
export function createContextMenu() {
  const state = shallowReactive({ target: null as FrameActionTarget | null, x: 0, y: 0, restore: null as HTMLElement | null })
  return {
    state,
    /** Pointer or keyboard opening captures frame identity without selecting it. */
    open(event: MouseEvent | KeyboardEvent, target: FrameActionTarget): void {
      if ('key' in event && event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
      event.preventDefault()
      event.stopPropagation()
      const anchor = event.currentTarget as HTMLElement | null
      const rect = anchor?.getBoundingClientRect()
      state.x = 'clientX' in event ? event.clientX : (rect?.left ?? 0) + 16
      state.y = 'clientY' in event ? event.clientY : (rect?.top ?? 0) + 24
      state.restore = anchor?.matches?.('button, [tabindex]') ? anchor : anchor?.querySelector?.<HTMLElement>('button, [tabindex]') ?? anchor
      state.target = { ...target }
    },
    /** Dismissal restores chrome focus on keyboard exit only. */
    close(restore = false): void {
      state.target = null
      if (restore) state.restore?.focus()
      state.restore = null
    },
  }
}

/** Nearest workbench owns its menu; nested embeds cannot share frame targets. */
const menuKey: InjectionKey<ReturnType<typeof createContextMenu>> = Symbol('histoire-context-menu')

/** Bind menu state before mounting canvas frame chrome. */
export function provideContextMenu(menu: ReturnType<typeof createContextMenu>): void {
  provide(menuKey, menu)
}

/** Optional on portable surfaces which do not expose standalone actions. */
export function useContextMenu(): ReturnType<typeof createContextMenu> | undefined {
  return inject(menuKey, undefined)
}
