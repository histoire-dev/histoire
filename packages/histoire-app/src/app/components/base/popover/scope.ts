import type { InjectionKey } from 'vue'

/** Logical overlay ancestry remains intact when panels teleport elsewhere. */
export interface PopoverScope {
  /** Logical parent captured before toolbar provides its own scope. */
  parent?: PopoverScope
  /** Nesting determines paint order. */
  depth: number
  /** Registered descendant panels, including currently closed controls. */
  children: Set<PopoverScope>
  /** Resolve current open state without retaining retired refs. */
  opened: () => boolean
  /** Trigger retained while its owning control moves between hosts. */
  anchor: () => HTMLElement | null
  /** Check this panel, its trigger, and any open descendants. */
  contains: (target: Node) => boolean
  /** Close this panel; explicit keyboard dismissal may restore its trigger. */
  close: (restore?: boolean) => void
}

/** Provider-local overlay chain; no document-global active panel. */
export const popoverScopeKey: InjectionKey<PopoverScope> = Symbol('PopoverScope')

/** Create a scope before its panel mounts, allowing persistent slot children. */
export function createPopoverScope(parent?: PopoverScope): PopoverScope {
  return { parent, depth: (parent?.depth ?? -1) + 1, children: new Set(), opened: () => false, anchor: () => null, contains: () => false, close: () => {} }
}

/** Dismiss descendants before their parent hides, preserving mounted control state. */
export function closePopoverChildren(scope: PopoverScope): void {
  for (const child of scope.children) {
    closePopoverChildren(child)
    if (child.opened()) child.close()
  }
}

/** Parent handlers defer keyboard dismissal to deepest active descendant. */
export function deepestOpenPopover(scope: PopoverScope): PopoverScope {
  let deepest = scope
  for (const child of scope.children) {
    const candidate = deepestOpenPopover(child)
    if (candidate.opened() && candidate.depth > deepest.depth) deepest = candidate
  }
  return deepest
}
