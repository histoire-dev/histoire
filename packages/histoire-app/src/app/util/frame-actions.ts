import type { HistoireSession } from '@histoire/sdk'
import type { InjectionKey } from 'vue'
import type { createShortcutRegistry } from './shortcuts.js'
import { getSandboxRelativeUrl } from '@histoire/protocol'
import { requestHistoireOpenInEditor } from '@histoire/sdk/internal'
import { inject, provide, shallowReactive, shallowRef } from 'vue'
import { createFrameVariantSource } from './frame-variant-source.js'

/** Immutable identity captured by frame chrome before any action changes selection. */
export interface FrameActionTarget {
  /** Collected story ID. */
  storyId: string
  /** Collected variant ID. */
  variantId: string
  /** Canvas registration key. */
  frameKey: string
}

/** Capability-gated action shared by frame menu and future toolbar extensions. */
export interface FrameAction {
  /** Stable registration identity. */
  id: string
  /** Native menu label. */
  label: string
  /** Carbon icon name. */
  icon: string
  /** Visual group; adjacent changes add a separator. */
  group?: string
  /** Shortcut registry action ID. */
  shortcut?: string
  /** Static books hide dev actions. */
  devOnly?: boolean
  /** Unavailable capabilities are hidden. */
  available?: (target: FrameActionTarget) => boolean
  /** Visible disabled action explains readiness requirement. */
  disabled?: (target: FrameActionTarget) => string | undefined
  /** Optional dynamic submenu. */
  children?: (target: FrameActionTarget) => readonly FrameAction[]
  /** Action runs against captured target, never implicit active variant. */
  run: (target: FrameActionTarget) => unknown | Promise<unknown>
}

/** Explicit adapter hooks keep URL, clipboard and frame/session authority replaceable. */
export interface FrameActionOptions {
  /** Primary canonical session. */
  session: HistoireSession
  /** Canonical standalone story URL. */
  link: (target: FrameActionTarget) => string
  /** Reveal captured story/variant in owning tree. */
  reveal: (target: FrameActionTarget) => unknown | Promise<unknown>
  /** Resolve frame-specific independent runtime, if mounted. */
  frameSession?: (target: FrameActionTarget) => HistoireSession | null
  /** Clipboard abstraction used by behavior tests and native host. */
  copy?: (text: string) => Promise<void>
  /** Opening isolated preview stays native and explicit. */
  open?: (url: string) => void
  /** Surface failures through owning provider. */
  error?: (error: unknown) => void
}

/** Create per-workbench registry; feature slices register rather than patching menu markup. */
export function createFrameActions(options: FrameActionOptions) {
  const entries = shallowReactive(new Map<string, FrameAction>())
  const manualCopy = shallowRef<string | null>(null)
  /** Copy rejection preserves actual text for keyboard/manual recovery. */
  async function copy(text: string, isCurrent = () => true) {
    if (!isCurrent()) return
    try {
      if (options.copy) {
        await options.copy(text)
      }
      else {
        if (!navigator.clipboard) throw new Error('Clipboard is unavailable')
        await navigator.clipboard.writeText(text)
      }
    }
    catch { if (isCurrent()) manualCopy.value = text }
  }
  /** Frame-local preview session prevents copying or testing another variant's live state. */
  function session(target: FrameActionTarget) {
    return options.frameSession?.(target) ?? options.session
  }
  /** Actions which need state explicitly select only after user invokes them. */
  async function select(target: FrameActionTarget) {
    const owner = session(target)
    const current = owner.getSnapshot().selection
    if (current?.storyId !== target.storyId || current.variantId !== target.variantId) await owner.selection.select(target)
    return owner
  }
  /** Dev capability gates follow current source, not compile-time global state. */
  function dev() {
    return options.session.getSnapshot().source?.mode === 'dev'
  }
  const variantSource = createFrameVariantSource({ session: options.session, resolve: target => options.frameSession ? options.frameSession(target) : options.session, error: options.error })
  const registry = { entries, manualCopy,
    /** Duplicate actions fail early; disposer cannot unregister replacement. */
    registerFrameAction(action: FrameAction): () => void {
      if (entries.has(action.id)) throw new Error(`Duplicate frame action: ${action.id}`)
      entries.set(action.id, action)
      return () => {
        if (entries.get(action.id) === action) entries.delete(action.id)
      }
    },
    /** Hide unsupported features and static-only restrictions before rendering. */
    list(target: FrameActionTarget): FrameAction[] {
      return [...entries.values()].filter(action => (!action.devOnly || dev()) && action.available?.(target) !== false)
    },
    /** Central observed execution preserves captured target and handles async failures. */
    async run(action: FrameAction, target: FrameActionTarget): Promise<void> {
      if (action.disabled?.(target) || action.available?.(target) === false || (action.devOnly && !dev())) return
      try {
        await action.run({ ...target })
      }
      catch (error) { options.error?.(error) }
    },
    /** Caller closes manual recovery after copying or selecting text. */
    dismissCopy(): void { manualCopy.value = null } }
  const actions: FrameAction[] = [
    { id: 'open-isolated', label: 'Open isolated', icon: 'launch', group: 'open', shortcut: 'frame.isolated', run(target) {
      const source = options.session.getSnapshot().source
      if (!source) return
      const base = new URL(source.url)
      const url = new URL(getSandboxRelativeUrl({ base: base.pathname, storyId: target.storyId, variantId: target.variantId }), base).href
      if (options.open) options.open(url)
      else window.open(url, '_blank', 'noopener')
    } },
    { id: 'open-editor', label: 'Open in editor', icon: 'code', group: 'open', shortcut: 'frame.editor', devOnly: true, available: () => options.session.getSnapshot().capabilities.openInEditor.available, run: target => requestHistoireOpenInEditor(options.session, target) },
    { id: 'reveal', label: 'Reveal in tree', icon: 'tree-view', group: 'open', run: options.reveal },
    { id: 'copy-source', label: 'Copy source', icon: 'copy', group: 'copy', shortcut: 'frame.source', available: (target) => {
      const snapshot = session(target).getSnapshot()
      return snapshot.capabilities.rawSource.available || snapshot.capabilities.dynamicSource.available
    }, async run(target) {
      const owner = session(target)
      const snapshot = owner.getSnapshot()
      const dynamic = snapshot.runtime.status === 'ready' && snapshot.capabilities.dynamicSource.available && snapshot.selection?.storyId === target.storyId && snapshot.selection.variantId === target.variantId
      const source = await owner.source.get({ storyId: target.storyId, variantId: target.variantId, mode: dynamic ? 'dynamic' : 'raw' })
      await copy(source.body)
    } },
    { id: 'copy-link', label: 'Copy link', icon: 'link', group: 'copy', run: target => copy(options.link(target)) },
    { id: 'run-tests', label: 'Run tests', icon: 'chemistry', group: 'tests', shortcut: 'frame.tests', devOnly: true, available: () => options.session.getSnapshot().capabilities.serverTests.available, async run(target) {
      await (await select(target)).tests.run({ mode: 'server' })
    } },
    { id: 'save-props', label: 'Save props as variant', icon: 'bookmark-add', group: 'tests', available: variantSource.available, disabled: variantSource.disabled, async run(target) {
      const result = await variantSource.generate(target)
      if (result) await copy(result.text, result.isCurrent)
    } },
  ]
  for (const action of actions) registry.registerFrameAction(action)
  return registry
}

/** Feature extension convenience keeps registration API independent of a singleton. */
export function registerFrameAction(registry: ReturnType<typeof createFrameActions>, action: FrameAction): () => void {
  return registry.registerFrameAction(action)
}

/** Menu hints and native frame shortcuts share action IDs and live capability gates. */
export function registerFrameShortcuts(shortcuts: ReturnType<typeof createShortcutRegistry>, actions: ReturnType<typeof createFrameActions>, target: (event?: KeyboardEvent) => FrameActionTarget | null): () => void {
  const definitions = [
    { action: 'open-isolated', id: 'frame.isolated' },
    { action: 'open-editor', id: 'frame.editor' },
    { action: 'copy-source', id: 'frame.source' },
    { action: 'run-tests', id: 'frame.tests' },
    { action: 'screenshot', id: 'frame.screenshot' },
    { action: 'comment', id: 'frame.comment' },
  ]
  const dispose = definitions.map(definition => shortcuts.bind(definition.id, (event) => {
    const current = target(event)
    const action = actions.entries.get(definition.action)
    if (current && action) void actions.run(action, current)
  }, { enabled: () => {
    const current = target()
    const action = actions.entries.get(definition.action)
    return Boolean(current && action && actions.list(current).includes(action) && !action.disabled?.(current))
  } }))
  return () => dispose.forEach(remove => remove())
}

/** Registry context shared by canvas chrome and top-level menu. */
const actionsKey: InjectionKey<ReturnType<typeof createFrameActions>> = Symbol('histoire-frame-actions')
/** Install root-owned action adapters. */
export function provideFrameActions(registry: ReturnType<typeof createFrameActions>): void {
  provide(actionsKey, registry)
}
/** Optional registry allows embedding without standalone actions. */
export function useFrameActions(): ReturnType<typeof createFrameActions> | undefined {
  return inject(actionsKey, undefined)
}
