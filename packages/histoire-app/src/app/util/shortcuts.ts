import type { InjectionKey } from 'vue'
import { inject, provide, shallowReactive } from 'vue'

/** Keyboard ownership stays local to workbench/provider scope. */
export type ShortcutScope = 'global' | 'canvas' | 'frame'

/** One binding drives handlers, toolbar hints, menu hints and settings reference. */
export interface ShortcutDefinition {
  /** Stable action identity. */
  id: string
  /** Human-readable action name. */
  label: string
  /** Alternatives, using mod for platform command/control. */
  keys: readonly string[]
  /** Focus scope in which action can run. */
  scope: ShortcutScope
  /** Hide action in static books. */
  devOnly?: boolean
  /** Permit shortcut while editing text. */
  allowInput?: boolean
  /** Optional live capability gate. */
  enabled?: () => boolean
  /** Execute action after preventing native default. */
  handler: (event: KeyboardEvent) => unknown
}

/** Handler-free reference remains available while a route's tools are unmounted. */
export type ShortcutReference = Pick<ShortcutDefinition, 'id' | 'label' | 'keys' | 'scope' | 'devOnly'>

/** One source defines built-in bindings; active surfaces bind handlers by identity. */
const builtins: readonly ShortcutReference[] = [
  { id: 'global.search', label: 'Search', keys: ['mod+k'], scope: 'global' },
  { id: 'global.theme', label: 'Toggle dark mode', keys: ['mod+shift+d'], scope: 'global' },
  { id: 'canvas.select', label: 'Select tool', keys: ['v'], scope: 'canvas' },
  { id: 'canvas.pan', label: 'Pan tool', keys: ['h'], scope: 'canvas' },
  { id: 'canvas.measure', label: 'Measure tool', keys: ['m'], scope: 'canvas' },
  { id: 'canvas.pan-hold', label: 'Hold to pan', keys: ['space'], scope: 'canvas' },
  { id: 'canvas.fit', label: 'Fit to canvas', keys: ['shift+1'], scope: 'canvas' },
  { id: 'canvas.selection', label: 'Zoom to selection', keys: ['shift+2'], scope: 'canvas' },
  { id: 'canvas.actual', label: 'Actual size', keys: ['shift+0'], scope: 'canvas' },
  { id: 'frame.isolated', label: 'Open isolated', keys: ['mod+enter'], scope: 'frame' },
  { id: 'frame.editor', label: 'Open in editor', keys: ['alt+e'], scope: 'frame', devOnly: true },
  { id: 'frame.source', label: 'Copy source', keys: ['mod+shift+c'], scope: 'frame' },
  { id: 'frame.tests', label: 'Run tests', keys: ['t'], scope: 'frame', devOnly: true },
  { id: 'frame.screenshot', label: 'Screenshot', keys: ['shift+s'], scope: 'frame', devOnly: true },
  { id: 'frame.comment', label: 'Comment for AI', keys: ['c'], scope: 'frame', devOnly: true },
]

/** Normalize equivalent modifier spellings for duplicate detection. */
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

/** Exact modifiers avoid stale held-key state and accidental shifted actions. */
export function matchesShortcut(binding: string, event: KeyboardEvent): boolean {
  const parts = normalize(binding).split('+')
  const key = parts.pop()!
  const mod = parts.includes('mod')
  if (event.altKey !== parts.includes('alt') || event.shiftKey !== parts.includes('shift')) return false
  if (mod ? !(event.metaKey || event.ctrlKey) : event.metaKey !== parts.includes('meta') || event.ctrlKey !== parts.includes('ctrl')) return false
  const physicalDigit = /^\d$/.test(key) && event.code === `Digit${key}`
  return physicalDigit || (key === 'space' ? event.code === 'Space' || event.key === ' ' : event.key.toLowerCase() === key)
}

/** Detect editable native controls without requiring a global DOM realm. */
function isEditing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return Boolean(element?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
}

/** Per-workbench registration; disposer removes only its original definition. */
export function createShortcutRegistry() {
  const entries = shallowReactive(new Map<string, ShortcutDefinition>())
  const reference = shallowReactive(new Map(builtins.map(item => [item.id, item])))
  const registry = {
    entries,
    reference,
    /** Reject ambiguous bindings before attaching listeners. */
    register(definition: ShortcutDefinition): () => void {
      if (entries.has(definition.id)) throw new Error(`Duplicate shortcut id: ${definition.id}`)
      for (const existing of entries.values()) {
        if (existing.scope === definition.scope && definition.keys.some(key => existing.keys.some(value => concreteBindings(value).some(binding => concreteBindings(key).includes(binding))))) throw new Error(`Duplicate shortcut binding: ${definition.id}`)
      }
      entries.set(definition.id, definition)
      const { id, label, keys, scope, devOnly } = definition
      reference.set(id, { id, label, keys, scope, devOnly })
      return () => {
        if (entries.get(definition.id) === definition) entries.delete(definition.id)
      }
    },
    /** Bind canonical metadata while preserving removable per-surface runtime authority. */
    bind(id: string, handler: ShortcutDefinition['handler'], options: Pick<ShortcutDefinition, 'enabled' | 'allowInput'> = {}): () => void {
      const descriptor = reference.get(id)
      if (!descriptor) throw new Error(`Unknown shortcut: ${id}`)
      return registry.register({ ...descriptor, ...options, handler })
    },
    /** Ordered scopes give focused frame/canvas actions precedence over global ones. */
    handle(event: KeyboardEvent, scopes: readonly ShortcutScope[], dev: boolean): boolean {
      if (event.defaultPrevented || event.repeat) return false
      for (const scope of scopes) {
        const action = [...entries.values()].find(item => item.scope === scope && (!item.devOnly || dev) && (!isEditing(event.target) || item.allowInput) && item.enabled?.() !== false && item.keys.some(binding => matchesShortcut(binding, event)))
        if (!action) continue
        event.preventDefault()
        action.handler(event)
        return true
      }
      return false
    },
    /** Human-readable first alternative shared by every shortcut hint. */
    hint(id: string): string {
      const command = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform) ? '⌘' : 'Ctrl'
      return (entries.get(id) ?? reference.get(id))?.keys[0]?.split('+').map(key => ({ mod: command, shift: '⇧', alt: 'Alt', space: 'Space' })[key] ?? key.toUpperCase()).join(' ') ?? ''
    },
  }
  return registry
}

/** Injectable registry prevents unrelated workbenches sharing keyboard authority. */
const shortcutsKey: InjectionKey<ReturnType<typeof createShortcutRegistry>> = Symbol('histoire-shortcuts')

/** Bind registry created by standalone shell. */
export function provideShortcutRegistry(registry: ReturnType<typeof createShortcutRegistry>): void {
  provide(shortcutsKey, registry)
}

/** Independent surfaces may omit keyboard bindings. */
export function useShortcutRegistry(): ReturnType<typeof createShortcutRegistry> | undefined {
  return inject(shortcutsKey, undefined)
}
