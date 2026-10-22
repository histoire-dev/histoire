import type { HistoireSelectionInput, HistoireTarget } from '@histoire/protocol'
import type { InjectionKey } from 'vue'
import type { FrameActionTarget } from '../util/frame-actions.js'
import { inject, provide, shallowReactive } from 'vue'

/** Workbench surfaces retain exact target identity while the menu is open. */
export type WorkbenchContextTarget =
  | { kind: 'frame' | 'story' | 'search-result' | 'test' | 'inspector' | 'toolbar', label: string, frame?: FrameActionTarget, selection?: HistoireSelectionInput | HistoireTarget, key?: string }
  | { kind: 'folder' | 'test-group', label: string, key: string, path?: string[], storyId?: string, expanded: boolean }
  | { kind: 'comment', label: string, key: string, selection?: HistoireTarget, status: string, frame?: FrameActionTarget }
  | { kind: 'control', label: string, key: string, controlKind: 'prop' | 'state', element: HTMLElement, resetElement?: HTMLButtonElement }

/** Shared capability-gated action shape for non-frame workbench targets. */
export interface WorkbenchContextAction {
  /** Stable action identity. */
  id: string
  /** Native menu label. */
  label: string
  /** Carbon icon name. */
  icon: string
  /** Adjacent groups receive a separator. */
  group?: string
  /** Append to every target's menu after its own actions. */
  global?: boolean
  /** Existing shortcut registry identity used for the menu hint. */
  shortcut?: string
  /** Unsupported target/action pairs stay hidden. */
  available?: (target: WorkbenchContextTarget) => boolean
  /** Visible unavailable actions explain their readiness requirement. */
  disabled?: (target: WorkbenchContextTarget) => string | undefined
  /** Run using the captured target. */
  run: (target: WorkbenchContextTarget) => unknown | Promise<unknown>
}

/** Optional owner error handler keeps rejected async actions observable. */
export interface ContextMenuOptions {
  /** Surface failed menu actions. */
  error?: (error: unknown) => void
}

/** Native context-menu keyboard equivalents used on workbench-owned targets. */
export function isContextMenuShortcut(event: KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}

/** Create one owner-scoped menu state and action registry. */
export function createContextMenu(options: ContextMenuOptions = {}) {
  const entries = shallowReactive(new Map<string, WorkbenchContextAction>())
  const state = shallowReactive({
    /** Legacy exact frame target feeds frame shortcuts and frame action registry. */
    target: null as FrameActionTarget | null,
    /** General workbench target captured independently from active selection. */
    context: null as WorkbenchContextTarget | null,
    /** Menu actions contributed by the target-owning component. */
    actionIds: [] as string[],
    x: 0,
    y: 0,
    restore: null as HTMLElement | null,
  })
  return {
    state,
    entries,
    /** Register once per workbench; disposal cannot unregister a replacement. */
    register(action: WorkbenchContextAction): () => void {
      if (entries.has(action.id)) throw new Error(`Duplicate workbench context action: ${action.id}`)
      entries.set(action.id, action)
      return () => {
        if (entries.get(action.id) === action) entries.delete(action.id)
      }
    },
    /** Filter registered actions through exact target capabilities. */
    list(target: WorkbenchContextTarget): WorkbenchContextAction[] {
      // Global actions stay last even when a surface explicitly requests one.
      const local = state.actionIds.filter(id => !entries.get(id)?.global)
      const global = [...entries.values()].filter(action => action.global).map(action => action.id)
      return [...new Set([...local, ...global])].map(id => entries.get(id)).filter((action): action is WorkbenchContextAction => Boolean(action && action.available?.(target) !== false))
    },
    /** Handle action failures at the owning workbench boundary. */
    async run(action: WorkbenchContextAction, target: WorkbenchContextTarget): Promise<void> {
      if (action.available?.(target) === false || action.disabled?.(target)) return
      try {
        await action.run(cloneTarget(target))
      }
      catch (error) { options.error?.(error) }
    },
    /** Capture exact target, pointer position, and keyboard focus owner. */
    open(event: MouseEvent | KeyboardEvent, input: FrameActionTarget | WorkbenchContextTarget, actionIds: readonly string[] = []): boolean {
      if ('key' in event && !isContextMenuShortcut(event)) return false
      if (hasNativeContextOwner(event.target)) return false
      const context = isFrameActionTarget(input)
        ? { kind: 'frame' as const, label: `${input.storyId} › ${input.variantId}`, frame: { ...input }, selection: { storyId: input.storyId, variantId: input.variantId } }
        : cloneTarget(input)
      event.preventDefault()
      event.stopPropagation()
      const anchor = event.currentTarget as HTMLElement | null
      const rect = anchor?.getBoundingClientRect()
      state.x = 'clientX' in event ? event.clientX : (rect?.left ?? 0) + 16
      state.y = 'clientY' in event ? event.clientY : (rect?.top ?? 0) + 24
      state.restore = anchor?.matches?.('button, [tabindex]') ? anchor : anchor?.querySelector?.<HTMLElement>('button, [tabindex]') ?? anchor
      state.context = context
      state.target = 'frame' in context && context.frame ? { ...context.frame } : null
      state.actionIds = [...actionIds]
      return true
    },
    /** Dismissal restores focus only after keyboard dismissal. */
    close(restore = false): void {
      state.target = null
      state.context = null
      state.actionIds = []
      if (restore) state.restore?.focus()
      state.restore = null
    },
  }
}

/** Clone mutable target identity before a virtual row can be recycled. */
function cloneTarget(target: WorkbenchContextTarget): WorkbenchContextTarget {
  switch (target.kind) {
    case 'folder':
    case 'test-group':
      return { ...target, path: target.path ? [...target.path] : undefined }
    case 'comment':
      return { ...target, ...(target.selection ? { selection: { ...target.selection } } : {}), frame: target.frame ? { ...target.frame } : undefined }
    case 'control':
      return { ...target }
    default:
      return {
        ...target,
        frame: target.frame ? { ...target.frame } : undefined,
        ...(target.selection ? { selection: { ...target.selection } } : {}),
      }
  }
}

/** Existing frame callers retain their compact target shape. */
function isFrameActionTarget(value: FrameActionTarget | WorkbenchContextTarget): value is FrameActionTarget {
  return 'frameKey' in value
}

/** Preserve native browser menus for editors, links, and existing popovers. */
function hasNativeContextOwner(value: EventTarget | null): boolean {
  return typeof Element !== 'undefined' && value instanceof Element && Boolean(value.closest('iframe, input, textarea, select, [contenteditable="true"], a[href], .histoire-control-popover, .histoire-source-content'))
}

/** Nearest workbench owns its menu; nested embeds cannot share frame targets. */
const menuKey: InjectionKey<ReturnType<typeof createContextMenu>> = Symbol('histoire-context-menu')

/** Bind menu state before mounting canvas frame chrome. */
export function provideContextMenu(menu: ReturnType<typeof createContextMenu>): void {
  provide(menuKey, menu)
}

/** Optional outside standalone workbenches. */
export function useContextMenu(): ReturnType<typeof createContextMenu> | undefined {
  return inject(menuKey, undefined)
}
