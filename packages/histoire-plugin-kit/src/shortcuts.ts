import type { ShortcutScope } from './types/commands.js'
import type { Disposer } from './types/common.js'
import type { QualifiedContribution } from './types/contribution.js'
import type { ExtensionHost } from './types/host.js'

/** Built-in key binding; plugin shortcuts overlapping one are disabled in every host. */
export interface BuiltinShortcut {
  /** Stable action identity. */
  readonly id: string
  /** Human-readable action name. */
  readonly label: string
  /** Alternatives, using `mod` for platform command/control. */
  readonly keys: readonly string[]
  /** Focus scope in which the action runs. */
  readonly scope: ShortcutScope
  /** Hidden in static books. */
  readonly devOnly?: boolean
}

/**
 * Built-in bindings shared by the standalone workbench and native hosts (native hosts bind the
 * global search only). Built-ins take precedence whether or not their surface is mounted.
 */
export const BUILTIN_SHORTCUTS: readonly BuiltinShortcut[] = Object.freeze([
  { id: 'global.search', label: 'Search', keys: ['mod+k'], scope: 'global' },
  { id: 'global.toggle-ui', label: 'Toggle UI', keys: ['mod+shift+h'], scope: 'global' },
  { id: 'global.show-ui', label: 'Show UI', keys: ['escape'], scope: 'global' },
  { id: 'global.theme', label: 'Toggle dark mode', keys: ['mod+shift+d'], scope: 'global' },
  { id: 'canvas.select', label: 'Select tool', keys: ['v'], scope: 'canvas' },
  { id: 'canvas.pan', label: 'Pan tool', keys: ['h'], scope: 'canvas' },
  { id: 'canvas.measure', label: 'Measure tool', keys: ['m'], scope: 'canvas' },
  { id: 'canvas.comment', label: 'Comment tool', keys: ['c'], scope: 'canvas', devOnly: true },
  { id: 'canvas.pan-hold', label: 'Hold to pan', keys: ['space'], scope: 'canvas' },
  { id: 'canvas.fit', label: 'Fit to canvas', keys: ['shift+1'], scope: 'canvas' },
  { id: 'canvas.selection', label: 'Zoom to selection', keys: ['shift+2'], scope: 'canvas' },
  { id: 'canvas.actual', label: 'Actual size', keys: ['shift+0'], scope: 'canvas' },
  { id: 'canvas.remount', label: 'Remount all', keys: ['shift+r'], scope: 'canvas' },
  { id: 'frame.isolated', label: 'Open isolated', keys: ['mod+enter'], scope: 'frame' },
  { id: 'frame.remount', label: 'Remount', keys: ['r'], scope: 'frame' },
  { id: 'frame.editor', label: 'Open in editor', keys: ['alt+e'], scope: 'frame', devOnly: true },
  { id: 'frame.source', label: 'Copy source', keys: ['mod+shift+c'], scope: 'frame' },
  { id: 'frame.tests', label: 'Run tests', keys: ['t'], scope: 'frame', devOnly: true },
  { id: 'frame.screenshot', label: 'Screenshot', keys: ['shift+s'], scope: 'frame', devOnly: true },
  { id: 'frame.comment', label: 'Comment for AI', keys: ['shift+c'], scope: 'frame', devOnly: true },
  { id: 'comment.screenshot', label: 'Capture screenshot for AI message', keys: ['mod+shift+s'], scope: 'comment', devOnly: true },
  { id: 'comment.attach', label: 'Attach files to AI message', keys: ['mod+u'], scope: 'comment', devOnly: true },
] satisfies BuiltinShortcut[])

/** Keys and scope of a binding. */
export type ShortcutBinding = Pick<BuiltinShortcut, 'keys' | 'scope'>

/** Binding with its identity, as conflicts name the binding that wins. */
export type IdentifiedShortcutBinding = ShortcutBinding & Pick<BuiltinShortcut, 'id'>

/** Registered plugin shortcut. */
type PluginShortcut = QualifiedContribution<'shortcut'>

/** Keyboard event fields shortcut matching reads. */
export type ShortcutKeyEvent = Pick<KeyboardEvent, 'key' | 'code' | 'altKey' | 'shiftKey' | 'metaKey' | 'ctrlKey'>

/** Normalizes equivalent modifier spellings for duplicate detection. */
function normalize(binding: string): string {
  const parts = binding.toLowerCase().split('+').map(value => value.trim())
  const key = parts.pop()!
  return [...parts.sort(), key].join('+')
}

/** Platform aliases overlap explicit Control/Command bindings on supported hosts. */
function concreteBindings(binding: string): string[] {
  const value = normalize(binding)
  return value.split('+').includes('mod') ? ['ctrl', 'meta'].map(modifier => normalize(value.replace(/\bmod\b/, modifier))) : [value]
}

/**
 * Whether two bindings share a scope and at least one concrete key combination.
 * @param a First binding.
 * @param b Second binding.
 */
export function shortcutBindingsOverlap(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return a.scope === b.scope && a.keys.some(key => b.keys.some(value => concreteBindings(value).some(binding => concreteBindings(key).includes(binding))))
}

/**
 * Built-in shortcut overlapping `binding`, bound or not.
 * @param binding Candidate keys and scope.
 */
export function findBuiltinShortcutConflict(binding: ShortcutBinding): BuiltinShortcut | undefined {
  return BUILTIN_SHORTCUTS.find(item => shortcutBindingsOverlap(item, binding))
}

/** Inputs of {@link findPluginShortcutConflict}. */
export interface PluginShortcutConflictOptions {
  /** Bindings already registered in the host; the earliest binding wins. */
  bound?: Iterable<IdentifiedShortcutBinding>
  /** Focus scopes the host has; others cannot fire. All scopes by default. */
  scopes?: readonly ShortcutScope[]
}

/**
 * Why a plugin shortcut cannot bind, checked once at registration in every host: its scope has
 * no surface in the host, it overlaps a built-in (built-ins take precedence whether or not their
 * surface is mounted), or it overlaps an already bound shortcut of the same scope. The returned
 * error is recorded as a `report` diagnostic; the shortcut's command stays available.
 * @param shortcut Candidate shortcut.
 * @param options Bound shortcuts and host scopes.
 * @returns The diagnostic error, or `undefined` when the shortcut can bind.
 */
export function findPluginShortcutConflict(shortcut: IdentifiedShortcutBinding, options: PluginShortcutConflictOptions = {}): Error | undefined {
  const prefix = `[histoire] shortcut "${shortcut.id}" (${shortcut.keys.join(', ')})`
  if (options.scopes && !options.scopes.includes(shortcut.scope)) return new Error(`${prefix} uses scope "${shortcut.scope}", which this host does not have, and is disabled`)
  const builtin = findBuiltinShortcutConflict(shortcut)
  if (builtin) return new Error(`${prefix} conflicts with built-in "${builtin.id}" and is disabled`)
  for (const existing of options.bound ?? []) {
    if (shortcutBindingsOverlap(existing, shortcut)) return new Error(`${prefix} conflicts with "${existing.id}" and is disabled`)
  }
}

/** Plugin shortcuts of one host that passed registration checks. */
export interface PluginShortcutBindings {
  /**
   * First bound shortcut matching `event`, trying `scopes` in order (focused areas first).
   * @param event Keyboard event.
   * @param scopes Focus scopes containing the event target, innermost first.
   * @param accept Extra filter, e.g. availability in the current context.
   */
  match: (event: ShortcutKeyEvent, scopes: readonly ShortcutScope[], accept?: (shortcut: PluginShortcut) => boolean) => PluginShortcut | undefined
  /** Stops observing the host; never disposes it. */
  dispose: Disposer
}

/** Shortcut contributions already rejected (and reported) per host. */
const rejectedByHost = new WeakMap<ExtensionHost, WeakSet<PluginShortcut>>()

/**
 * Tracks `shortcut` contributions of a host without a shortcut registry (native Vue, React or
 * DOM hosts). Each contribution is checked once, when it is committed, with
 * {@link findPluginShortcutConflict}; a rejected one gets one `report` diagnostic and never
 * binds. A contribution leaving the registry frees its keys for later registrations.
 * @param host Extension host whose registry is observed.
 * @param scopes Focus scopes the host routes key events to; `global` only by default.
 */
export function createPluginShortcutBindings(host: ExtensionHost, scopes: readonly ShortcutScope[] = ['global']): PluginShortcutBindings {
  // Bound contributions in registration order. Rejections are remembered per host, so a
  // contribution reports once even when several bindings (providers) observe the same host.
  const bound = new Set<PluginShortcut>()
  const rejected = rejectedByHost.get(host) ?? new WeakSet<PluginShortcut>()
  rejectedByHost.set(host, rejected)
  let last: ReadonlyArray<PluginShortcut> | undefined

  /** Applies a registry snapshot; the same frozen snapshot means no shortcut changed. */
  function sync(): void {
    const snapshot = host.contributions('shortcut')
    if (snapshot === last) return
    // Set before reporting: diagnostics notify subscribers, re-entering with the same snapshot.
    last = snapshot
    const current = new Set(snapshot)
    for (const shortcut of bound) {
      if (!current.has(shortcut)) bound.delete(shortcut)
    }
    for (const shortcut of snapshot) {
      if (bound.has(shortcut) || rejected.has(shortcut)) continue
      const conflict = findPluginShortcutConflict(shortcut, { bound, scopes })
      if (!conflict) {
        bound.add(shortcut)
        continue
      }
      rejected.add(shortcut)
      host.reportViewError(shortcut.id, conflict, 'report')
    }
  }

  sync()
  const stop = host.subscribe(sync)
  return {
    match(event, eventScopes, accept) {
      for (const scope of eventScopes) {
        for (const shortcut of bound) {
          if (shortcut.scope === scope && shortcut.keys.some(keys => matchesShortcut(keys, event)) && accept?.(shortcut) !== false) return shortcut
        }
      }
    },
    dispose() {
      stop()
      bound.clear()
    },
  }
}

/**
 * Whether `event` matches one binding exactly (no extra modifiers; `mod` is command or control,
 * digits match their physical key).
 * @param binding Binding such as `mod+shift+k`.
 * @param event Keyboard event.
 */
export function matchesShortcut(binding: string, event: ShortcutKeyEvent): boolean {
  const parts = normalize(binding).split('+')
  const key = parts.pop()!
  const mod = parts.includes('mod')
  if (event.altKey !== parts.includes('alt') || event.shiftKey !== parts.includes('shift')) return false
  if (mod ? !(event.metaKey || event.ctrlKey) : event.metaKey !== parts.includes('meta') || event.ctrlKey !== parts.includes('ctrl')) return false
  const physicalDigit = /^\d$/.test(key) && event.code === `Digit${key}`
  return physicalDigit || (key === 'space' ? event.code === 'Space' || event.key === ' ' : event.key.toLowerCase() === key)
}

/**
 * Whether a key event target edits text (inputs, selects, content-editable, textbox roles);
 * shortcuts skip those unless they explicitly allow input. No global DOM realm required.
 * @param target Event target.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return Boolean(element?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
}
